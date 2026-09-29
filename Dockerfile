FROM node:20-bookworm-slim

# LibreOffice does the actual conversion. The fonts keep Word layouts close to the original
# (Carlito = Calibri, Caladea = Cambria, Liberation = Arial/Times New Roman).
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer libreoffice-core \
      fonts-liberation fonts-dejavu-core fonts-crosextra-carlito fonts-crosextra-caladea \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

ENV NODE_ENV=production HOME=/tmp
EXPOSE 3000
CMD ["node", "server.js"]
