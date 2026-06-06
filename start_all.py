import argparse
import os
import socket
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parent


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def env_port(name: str, default: int, *legacy_names: str) -> int:
    for candidate in (name, *legacy_names):
        raw_value = os.environ.get(candidate, "").strip()
        if not raw_value:
            continue
        try:
            return int(raw_value)
        except ValueError:
            print(f"[warn] invalid {candidate}={raw_value!r}; using {default}")
            return default
    return default


def target_host(host: str) -> str:
    return "127.0.0.1" if host in {"0.0.0.0", "::"} else host


def npm_command() -> str:
    return "npm.cmd" if os.name == "nt" else "npm"


def build_env(cwd: Path, extra_env: dict[str, str] | None = None) -> dict[str, str]:
    env = os.environ.copy()
    current_pythonpath = env.get("PYTHONPATH", "")
    paths = [str(cwd), str(ROOT)]
    if current_pythonpath:
        paths.append(current_pythonpath)
    env["PYTHONPATH"] = os.pathsep.join(dict.fromkeys(paths))
    if extra_env:
        env.update(extra_env)
    return env


@dataclass(frozen=True)
class Service:
    name: str
    cwd: Path
    args: list[str]
    host: str
    port: int
    public_url: str
    extra_env: dict[str, str] | None = None


def build_services() -> list[Service]:
    python = sys.executable
    career_frontend_port = env_port("CAREER_FRONTEND_PORT", 3000)
    career_api_port = env_port("CAREER_API_PORT", 8001, "STUDENT_BACKEND_PORT")
    job_admin_api_port = env_port("JOB_ADMIN_API_PORT", 8000, "JOB_BACKEND_PORT")
    job_admin_frontend_port = env_port("JOB_ADMIN_FRONTEND_PORT", 5173, "FRONTEND_PORT")

    career_api_host = "127.0.0.1"
    career_api_target = os.environ.get("CAREER_API_TARGET") or (
        f"http://{target_host(career_api_host)}:{career_api_port}"
    )
    job_admin_api_target = os.environ.get("JOB_ADMIN_API_TARGET") or (
        f"http://127.0.0.1:{job_admin_api_port}"
    )

    return [
        Service(
            name="A career-planner React frontend",
            cwd=ROOT / "career-planner" / "frontend",
            args=[
                npm_command(),
                "run",
                "dev",
                "--",
                "--host",
                "0.0.0.0",
                "--port",
                str(career_frontend_port),
                "--strictPort",
            ],
            host="0.0.0.0",
            port=career_frontend_port,
            public_url=f"http://localhost:{career_frontend_port}",
            extra_env={"VITE_API_TARGET": career_api_target},
        ),
        Service(
            name="B career-planner FastAPI",
            cwd=ROOT / "career-planner",
            args=[
                python,
                "-m",
                "uvicorn",
                "backend.app:app",
                "--host",
                career_api_host,
                "--port",
                str(career_api_port),
            ],
            host=career_api_host,
            port=career_api_port,
            public_url=f"http://localhost:{career_api_port}",
            extra_env={"CAREER_PLANNER_API_ONLY": "true"},
        ),
        Service(
            name="C job-admin FastAPI",
            cwd=ROOT / "job-admin" / "backend",
            args=[
                python,
                "-m",
                "uvicorn",
                "app:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(job_admin_api_port),
            ],
            host="127.0.0.1",
            port=job_admin_api_port,
            public_url=f"http://localhost:{job_admin_api_port}",
        ),
        Service(
            name="D job-admin React frontend",
            cwd=ROOT / "job-admin" / "frontend",
            args=[
                npm_command(),
                "run",
                "dev",
                "--",
                "--host",
                "0.0.0.0",
                "--port",
                str(job_admin_frontend_port),
                "--strictPort",
            ],
            host="0.0.0.0",
            port=job_admin_frontend_port,
            public_url=f"http://localhost:{job_admin_frontend_port}",
            extra_env={"JOB_ADMIN_API_TARGET": job_admin_api_target},
        ),
    ]


def iter_bind_targets(host: str, port: int) -> list[tuple[int, int, int, tuple[str, int] | tuple[str, int, int, int]]]:
    family = socket.AF_UNSPEC
    if host == "0.0.0.0":
        family = socket.AF_INET
    elif host == "::":
        family = socket.AF_INET6

    infos = socket.getaddrinfo(
        host,
        port,
        family=family,
        type=socket.SOCK_STREAM,
        flags=socket.AI_PASSIVE,
    )
    unique_infos: list[tuple[int, int, int, tuple[str, int] | tuple[str, int, int, int]]] = []
    seen: set[tuple[int, tuple[str, int] | tuple[str, int, int, int]]] = set()
    for family, socktype, proto, _canonname, sockaddr in infos:
        key = (family, sockaddr)
        if key in seen:
            continue
        seen.add(key)
        unique_infos.append((family, socktype, proto, sockaddr))
    return unique_infos


def is_port_available(port: int, host: str = "127.0.0.1") -> bool:
    bind_targets = iter_bind_targets(host, port)
    if not bind_targets:
        return False

    for family, socktype, proto, sockaddr in bind_targets:
        with socket.socket(family, socktype, proto) as sock:
            if os.name == "nt" and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            try:
                sock.bind(sockaddr)
            except OSError:
                return False
    return True


def validate_services(services: list[Service]) -> list[str]:
    errors: list[str] = []
    seen_ports: dict[int, str] = {}
    for service in services:
        if service.port in seen_ports:
            errors.append(
                f"port {service.port} is configured for both "
                f"{seen_ports[service.port]} and {service.name}"
            )
        else:
            seen_ports[service.port] = service.name
        if not service.cwd.exists():
            errors.append(f"missing cwd for {service.name}: {service.cwd}")
        if not is_port_available(service.port, service.host):
            errors.append(
                f"port {service.port} on {service.host} is already in use for {service.name}"
            )
    return errors


def start_service(service: Service) -> subprocess.Popen:
    print(f"[start] {service.name}: {' '.join(service.args)} (cwd={service.cwd})")
    return subprocess.Popen(
        service.args,
        cwd=str(service.cwd),
        env=build_env(service.cwd, service.extra_env),
    )


def stop_process_tree(process: subprocess.Popen, force: bool = False) -> None:
    if process.poll() is not None:
        return
    if os.name == "nt":
        args = ["taskkill", "/PID", str(process.pid), "/T"]
        if force:
            args.append("/F")
        try:
            subprocess.run(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return
        except Exception:
            pass
    if force:
        process.kill()
    else:
        process.terminate()


def stop_services(processes: list[tuple[Service, subprocess.Popen]]) -> None:
    for service, process in processes:
        if process.poll() is None:
            print(f"[stop] {service.name}")
            stop_process_tree(process)
    deadline = time.time() + 8
    for _service, process in processes:
        remaining = max(0.1, deadline - time.time())
        try:
            process.wait(timeout=remaining)
        except subprocess.TimeoutExpired:
            stop_process_tree(process, force=True)


def print_service_summary(services: list[Service]) -> None:
    print("\nServices:")
    for service in services:
        print(f"- {service.name}: {service.public_url}")
    print()
    print("API proxy targets:")
    for service in services:
        if service.extra_env:
            for key, value in service.extra_env.items():
                if key.endswith("_TARGET"):
                    print(f"- {key}: {value}")
    print()


def main() -> int:
    parser = argparse.ArgumentParser(description="Start the full job_system stack.")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Validate directories and ports without starting services.",
    )
    args = parser.parse_args()

    load_env_file(ROOT / ".env")
    services = build_services()
    errors = validate_services(services)
    if errors:
        print("[check] failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    if args.check:
        print("[check] ok")
        print_service_summary(services)
        return 0

    processes: list[tuple[Service, subprocess.Popen]] = []
    try:
        for service in services:
            processes.append((service, start_service(service)))
            time.sleep(0.5)

        print_service_summary(services)
        print("Press Ctrl+C to stop all services.\n")

        while True:
            for service, process in processes:
                code = process.poll()
                if code is not None:
                    print(f"[exit] {service.name} exited with code {code}")
                    stop_services(processes)
                    return code
            time.sleep(1)
    except KeyboardInterrupt:
        stop_services(processes)
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
