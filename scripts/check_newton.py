from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PHYSICS_ROOT = ROOT / 'physics' / 'newton-service'
sys.path.insert(0, str(PHYSICS_ROOT))

from app.newton_backend import detect_newton  # noqa: E402

print(json.dumps(detect_newton().__dict__, indent=2))
