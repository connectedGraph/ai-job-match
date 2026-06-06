import argparse
import os
import subprocess
import sys
import time
from pathlib import Path


def stop_process_tree(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(process.pid)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    else:
        process.terminate()


def target_host(host: str) -> str:
    return "127.0.0.1" if host in {"0.0.0.0", "::"} else host


def run_dev(args: argparse.Namespace, project_root: Path, frontend_dir: Path) -> int:
    api_target = f"http://{target_host(args.api_host)}:{args.api_port}"
    env = os.environ.copy()
    env["CAREER_PLANNER_API_ONLY"] = "true"
    env["VITE_API_TARGET"] = api_target

    backend_cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "backend.app:app",
        "--host",
        args.api_host,
        "--port",
        str(args.api_port),
        "--reload",
        "--reload-dir",
        str(project_root / "backend"),
    ]
    frontend_cmd = (
        f"npm run dev -- --host {args.host} --port {args.port} --strictPort"
    )

    print(">>> [DEV] Starting FastAPI API")
    print(f">>> API:      {api_target}")
    backend_process = subprocess.Popen(backend_cmd, cwd=str(project_root), env=env)

    time.sleep(1)

    print("\n>>> [DEV] Starting React/Vite frontend")
    print(f">>> Frontend: http://localhost:{args.port}")
    frontend_process = subprocess.Popen(
        frontend_cmd,
        cwd=str(frontend_dir),
        env=env,
        shell=True,
    )

    processes = [backend_process, frontend_process]
    try:
        while True:
            for process in processes:
                return_code = process.poll()
                if return_code is not None:
                    return return_code
            time.sleep(0.5)
    except KeyboardInterrupt:
        return 0
    finally:
        print("\n>>> Shutting down dev servers...")
        for process in processes:
            stop_process_tree(process)
        print(">>> Done.")


def run_prod(args: argparse.Namespace, project_root: Path, dist_dir: Path) -> None:
    if not dist_dir.exists():
        print("ERROR: 'frontend/dist' not found.")
        print("Run 'npm run build' in the frontend folder first.")
        sys.exit(1)

    os.environ.pop("CAREER_PLANNER_API_ONLY", None)

    import uvicorn

    print(">>> [PROD] Serving frontend/dist from FastAPI")
    print(f">>> App: http://localhost:{args.port}")
    uvicorn.run(
        "backend.app:app",
        host=args.host,
        port=args.port,
        reload=False,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="职途星 launcher")
    parser.add_argument(
        "-p",
        "--port",
        type=int,
        default=3000,
        help="Frontend/app port (default 3000)",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Frontend/app host (default 127.0.0.1)",
    )
    parser.add_argument(
        "--api-port",
        type=int,
        default=8001,
        help="FastAPI port in development (default 8001)",
    )
    parser.add_argument(
        "--api-host",
        default="127.0.0.1",
        help="FastAPI host in development (default 127.0.0.1)",
    )
    parser.add_argument(
        "--prod",
        action="store_true",
        help="Production mode: serve frontend/dist from FastAPI",
    )
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parent
    frontend_dir = project_root / "frontend"
    dist_dir = frontend_dir / "dist"

    if args.prod:
        run_prod(args, project_root, dist_dir)
        return

    if not frontend_dir.exists():
        print("ERROR: 'frontend' folder not found.")
        sys.exit(1)

    exit_code = run_dev(args, project_root, frontend_dir)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
