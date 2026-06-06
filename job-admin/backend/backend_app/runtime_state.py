from typing import Any, Dict, List, Tuple

import numpy as np


JOBS_FILE_MTIME = 0.0
tag_vectors_cache: Dict[str, np.ndarray] = {}
global_tag_freq: Dict[str, int] = {}
jobs_metadata: List[Dict[str, Any]] = []
inverted_index: Dict[str, List[Tuple[int, str]]] = {}
metadata_cache: Dict[str, List[str]] = {"directions": [], "industries": []}
