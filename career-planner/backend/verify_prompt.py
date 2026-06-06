import sys
from pathlib import Path

# Add backend to path
backend_dir = Path(r'c:\Users\18086\Desktop\job_system\career-planner\backend')
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from prompts import build_resume_parse_system_prompt

prompt = build_resume_parse_system_prompt()
print("--- GENERATED PROMPT ---")
print(prompt)
print("--- END OF PROMPT ---")
