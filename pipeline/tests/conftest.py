import sys
from pathlib import Path

# Every pipeline script relies on its own directory being importable
# ("from cities import ...", "from gtfs_io import ...") the same way it is
# when the script is run directly (python3 pipeline/foo.py adds pipeline/
# to sys.path[0] automatically) - pytest doesn't do that for us, so add it
# once here.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
