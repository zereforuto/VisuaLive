# Troubleshooting

## GPU not being used (System page shows CPUExecutionProvider)

- Run `check_environment.py` — confirm `nvidia-smi` works and
  `CUDAExecutionProvider` appears in the available providers list.
- Confirm you installed `onnxruntime-gpu`, not plain `onnxruntime`
  (`pip uninstall onnxruntime onnxruntime-gpu` then reinstall only
  `onnxruntime-gpu==1.19.2`).
- Update your NVIDIA driver to 566.xx or newer.
- The app still works on CPU — just slower. This is not a blocker.

## SQL Server connection fails at backend startup

- Confirm the SQL Server service is running (services.msc ->
  "SQL Server (MSSQLSERVER)" or "(SQLEXPRESS)").
- Confirm `DATABASE_SERVER` in `.env` matches your actual instance
  name — try `localhost\SQLEXPRESS` if `localhost` fails.
- Confirm "ODBC Driver 18 for SQL Server" is installed
  (`check_environment.py` reports installed drivers).
- If using SQL authentication instead of Windows auth, set
  `DATABASE_USE_SQL_AUTH=true` and fill in `DATABASE_USER`/`DATABASE_PASSWORD`.

## Camera unavailable / permission denied

- The browser must be given camera permission — check the address bar's
  permission icon in Chrome/Edge.
- Only one application can hold the camera at a time — close other apps
  (Zoom, Teams, etc.) using it.
- HTTPS is not required for `localhost`, but if accessing via a LAN IP,
  browsers may block camera access over plain HTTP.

## Video upload fails with "No face detected"

- Ensure the person's face is visible, reasonably well-lit, and takes up
  a meaningful portion of the frame for at least a few seconds in the
  video (the sampler takes ~1 frame/second).

## insightface fails to install / build error on Windows

- Install "Desktop development with C++" via the Visual Studio Build
  Tools installer, then retry `pip install insightface==0.7.3`.

## Frontend can't reach backend (network errors in console)

- Confirm the backend is running on port 8000 and `CORS_ORIGINS` in
  `.env` includes `http://localhost:5173`.
