"""
Environment diagnostic script for the Face Recognition project.

Run this BEFORE any application code is written, to confirm:
  1. NVIDIA GPU is visible to the OS
  2. Python version is compatible
  3. onnxruntime-gpu can see and use CUDA
  4. InsightFace can load its models on GPU
  5. ODBC Driver 18 for SQL Server is installed
  6. SQL Server is reachable

Usage:
    python check_environment.py

This script only reads/reports — it makes no changes to your system.
"""

import sys
import subprocess
import platform


def section(title: str) -> None:
    print("\n" + "=" * 60)
    print(title)
    print("=" * 60)


def check_python_version() -> None:
    section("1. Python Version")
    v = sys.version_info
    print(f"Python version: {platform.python_version()}")
    if v.major == 3 and v.minor in (10, 11):
        print("OK: Python 3.10/3.11 is supported.")
    else:
        print(
            f"WARNING: Python {v.major}.{v.minor} is not the target version "
            f"(3.11 recommended). Some CV/ML packages may not have wheels "
            f"for this version yet."
        )


def check_nvidia_driver() -> None:
    section("2. NVIDIA Driver / GPU")
    try:
        result = subprocess.run(
            ["nvidia-smi"], capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            print(result.stdout)
            print("OK: nvidia-smi ran successfully — driver is installed.")
        else:
            print("FAIL: nvidia-smi returned an error:")
            print(result.stderr)
    except FileNotFoundError:
        print(
            "FAIL: nvidia-smi not found on PATH. Either no NVIDIA driver is "
            "installed, or it's not on PATH. Install/update the driver from "
            "https://www.nvidia.com/Download/index.aspx"
        )
    except Exception as e:
        print(f"FAIL: Unexpected error running nvidia-smi: {e}")


def check_onnxruntime_gpu() -> None:
    section("3. ONNX Runtime GPU / CUDA Execution Provider")
    try:
        import onnxruntime as ort

        print(f"onnxruntime version: {ort.__version__}")
        providers = ort.get_available_providers()
        print(f"Available execution providers: {providers}")
        if "CUDAExecutionProvider" in providers:
            print("OK: CUDAExecutionProvider is available.")
        else:
            print(
                "WARNING: CUDAExecutionProvider NOT available. "
                "The app will fall back to CPUExecutionProvider "
                "(slower, but functional). Common causes: "
                "onnxruntime-gpu not installed (plain 'onnxruntime' was "
                "installed instead), or driver/CUDA runtime mismatch."
            )
    except ImportError:
        print(
            "FAIL: onnxruntime is not installed. Run: "
            "pip install onnxruntime-gpu==1.19.2"
        )
    except Exception as e:
        print(f"FAIL: Unexpected error importing onnxruntime: {e}")


def check_insightface() -> None:
    section("4. InsightFace Model Loading (GPU)")
    try:
        import insightface
        from insightface.app import FaceAnalysis

        print(f"insightface version: {insightface.__version__}")
        print("Attempting to initialize FaceAnalysis on GPU (ctx_id=0)...")
        app = FaceAnalysis(name="buffalo_l")
        app.prepare(ctx_id=0, det_size=(640, 640))
        print("OK: InsightFace initialized. Model pack 'buffalo_l' loaded.")
        print(
            "Note: if this actually ran on CPU despite ctx_id=0, it will "
            "still succeed here — cross-check against the CUDAExecutionProvider "
            "result in section 3 above."
        )
    except ImportError:
        print("FAIL: insightface is not installed. Run: pip install insightface==0.7.3")
    except Exception as e:
        print(f"FAIL: Error initializing InsightFace: {e}")
        print(
            "If this mentions a missing DLL or Cython build error, "
            "Visual C++ Build Tools may be required: "
            "https://visualstudio.microsoft.com/visual-cpp-build-tools/"
        )


def check_odbc_driver() -> None:
    section("5. ODBC Driver 18 for SQL Server")
    try:
        import pyodbc

        print(f"pyodbc version: {pyodbc.version}")
        drivers = pyodbc.drivers()
        print(f"Installed ODBC drivers: {drivers}")
        target = "ODBC Driver 18 for SQL Server"
        if target in drivers:
            print(f"OK: '{target}' is installed.")
        else:
            print(
                f"FAIL: '{target}' not found. Download it from: "
                f"https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server"
            )
    except ImportError:
        print("FAIL: pyodbc is not installed. Run: pip install pyodbc==5.1.0")
    except Exception as e:
        print(f"FAIL: Unexpected error checking ODBC drivers: {e}")


def check_sql_server_connection() -> None:
    section("6. SQL Server Connectivity")
    try:
        import pyodbc

        conn_str = (
            "DRIVER={ODBC Driver 18 for SQL Server};"
            "SERVER=localhost;"
            "DATABASE=master;"
            "Trusted_Connection=yes;"
            "TrustServerCertificate=yes;"
        )
        print("Attempting connection to localhost SQL Server instance (master db)...")
        conn = pyodbc.connect(conn_str, timeout=5)
        cursor = conn.cursor()
        cursor.execute("SELECT @@VERSION;")
        row = cursor.fetchone()
        print(f"OK: Connected. Server reports: {row[0][:80]}...")
        conn.close()
    except ImportError:
        print("SKIPPED: pyodbc not installed (see section 5).")
    except Exception as e:
        print(f"FAIL: Could not connect to local SQL Server: {e}")
        print(
            "Checklist: is SQL Server installed and the service running? "
            "Is 'localhost' the correct instance name (may need "
            "'localhost\\\\SQLEXPRESS')? Is Windows Authentication enabled?"
        )


def check_node() -> None:
    section("7. Node.js (for frontend tooling)")
    try:
        result = subprocess.run(
            ["node", "--version"], capture_output=True, text=True, timeout=10
        )
        print(f"Node version: {result.stdout.strip()}")
        result_npm = subprocess.run(
            ["npm", "--version"], capture_output=True, text=True, timeout=10, shell=True
        )
        print(f"npm version: {result_npm.stdout.strip()}")
    except FileNotFoundError:
        print("FAIL: Node.js not found on PATH. Install Node 20 LTS from nodejs.org")
    except Exception as e:
        print(f"FAIL: Unexpected error checking Node: {e}")


def main() -> None:
    print("Face Recognition Project — Environment Diagnostic")
    print(f"Platform: {platform.platform()}")
    check_python_version()
    check_nvidia_driver()
    check_onnxruntime_gpu()
    check_insightface()
    check_odbc_driver()
    check_sql_server_connection()
    check_node()
    section("Done")
    print(
        "Review any FAIL/WARNING lines above before proceeding to Phase 3. "
        "GPU-related warnings are not blockers (CPU fallback works), but "
        "SQL Server and ODBC driver FAILs must be resolved first."
    )


if __name__ == "__main__":
    main()
