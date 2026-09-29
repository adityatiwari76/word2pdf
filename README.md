# Word to PDF

Node.js + Express backend, plain HTML/CSS/JS frontend. LibreOffice does the conversion.

## Run on your laptop
1. Install Node.js (LTS): https://nodejs.org
2. Install LibreOffice: https://www.libreoffice.org/download
3. In this folder run:
       npm install
       npm start
4. Open http://localhost:3000

If the server says LibreOffice is not found, set its path first, for example
- Windows (PowerShell): $env:SOFFICE_PATH="C:\Program Files\LibreOffice\program\soffice.exe"; npm start
- Mac/Linux: SOFFICE_PATH=/path/to/soffice npm start

## Make it live (Render, Docker)
1. Put this folder on GitHub.
2. render.com -> New -> Web Service -> connect the repo.
3. Runtime: Docker (it finds the Dockerfile). Deploy.
4. You get a https://your-app.onrender.com link. Add a custom domain under Settings.

Settings you can change with environment variables:
PORT, MAX_FILE_MB (20), MAX_CONCURRENT (2), CONVERT_TIMEOUT_MS (90000), SOFFICE_PATH
"# word2pdf" 
