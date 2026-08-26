# Newton installation evidence

Date: 2026-08-26 (Europe/London)

## Environment

- Project environment: `D:\ROBO-SIM-MCP\.venv`
- Python: 3.11.9
- Newton: 1.5.0
- Warp: 1.16.0
- MuJoCo-Warp: 3.11.0
- MuJoCo: 3.11.0
- GPU: NVIDIA GeForce GTX 1070, 8192 MiB
- NVIDIA driver: 582.28
- NVIDIA reported CUDA compatibility: 13.0
- Secure install mode: pip trust-store TLS validation
- Global installs: none
- `pip check`: no broken requirements

## Runtime status

Newton and its optional examples were installed successfully in the project VENV. Newton and Warp import successfully with CPU selected, the official headless `basic_shapes` example passes, and all three bounded project physics cases pass on CPU.

The live GPU reached 90 C at 35-41 percent utilization while no Newton or Python GPU process was running. The WDDM process table showed desktop graphics applications but could not attribute per-process utilization. Newton runtime qualification therefore used CPU only. No process was terminated because ownership of the load was not proven.

## Safety

- No physical SCARA or Duet hardware was contacted.
- No robot command was sent to real hardware.
- No TLS check was disabled.
- No package was installed globally.
