# Utiliser une image Python officielle comme image de base
FROM python:3.13-slim

# Définir le répertoire de travail dans le conteneur
WORKDIR /app

# Copier le fichier des dépendances
COPY requirements.txt .

# Installer les dépendances
# --no-cache-dir réduit la taille de l'image
# --default-timeout=100 augmente le délai pour les téléchargements lents
RUN pip install --no-cache-dir --default-timeout=100 -r requirements.txt

# Copier tout le reste du code de l'application dans le répertoire de travail
COPY . .

# Définir les variables d'environnement nécessaires (peuvent être surchargées au lancement)
# Vous DEVREZ fournir GEMINI_API_KEY lors de l'exécution via -e
ENV FLASK_APP=app.py
ENV FLASK_RUN_HOST=0.0.0.0
ENV PORT=5002
# Le modèle Gemini peut être défini ici ou lors de l'exécution via -e
ENV GEMINI_MODEL="gemini-2.0-flash"

# Exposer le port que l'application Flask écoute (5002 basé sur app.py)
EXPOSE 5002

# Commande pour lancer l'application lorsque le conteneur démarre
CMD ["python", "app.py"]