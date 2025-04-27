# app.py
import os
import re
# import sqlite3 # Plus besoin ici
import json
import datetime
from flask import Flask, request, jsonify, render_template # Retrait de g
import google.generativeai as genai
from dotenv import load_dotenv

# Importer depuis les modules locaux
import database # NOUVEL IMPORT
from prompts import (
    THEMES, AGE_INSTRUCTIONS, GENDER_INSTRUCTIONS,
    PLAYER_NAME_INSTRUCTION_TEMPLATE, FORMAT_CHOIX_INSTRUCTION,
    TURN_COUNT_INSTRUCTION_TEMPLATE
)

# --- Configuration ---
load_dotenv()
GEMINI_API_KEY_FROM_ENV = os.getenv("GEMINI_API_KEY")
DEFAULT_MODEL = "gemini-2.0-flash"
GEMINI_MODEL_NAME = os.getenv("GEMINI_MODEL", DEFAULT_MODEL)
THEME_DATA = {}
# DATABASE = 'sessions.db' # Défini dans database.py maintenant
LANGUAGE_INSTRUCTION = "IMPORTANT : Toute l'aventure et toutes tes réponses doivent impérativement être et rester en langue française."
MIN_TURNS = 10
MAX_TURNS = 20

# --- Configuration Initiale et Vérifications Thèmes/API Key ---
try:
    THEME_DATA = {theme['name']: theme for theme in THEMES}
    print(f"--- Thèmes chargés: {list(THEME_DATA.keys())} ---")
except Exception as e:
    print(f"ERREUR critique lors du chargement des thèmes: {e}")

if not GEMINI_API_KEY_FROM_ENV:
    print("ERREUR critique: Clé API Gemini non trouvée.")
elif not THEME_DATA:
    print("ERREUR critique: Aucun thème chargé.")
else:
    try:
        genai.configure(api_key=GEMINI_API_KEY_FROM_ENV)
        print(f"--- SDK Google configuré (Modèle: {GEMINI_MODEL_NAME}) ---")
    except Exception as e:
        print(f"ERREUR critique config genai: {e}")
        GEMINI_API_KEY_FROM_ENV = None

# Initialiser Flask
app = Flask(__name__)
# Configuration pour utiliser instance_path si nécessaire pour la DB
app.config.from_mapping(
    DATABASE=os.path.join(app.instance_path, database.DATABASE)
)
# S'assurer que le dossier d'instance existe (utile pour la DB SQLite)
try:
    os.makedirs(app.instance_path, exist_ok=True)
    print(f"--- Dossier d'instance assuré: {app.instance_path} ---")
except OSError as e:
    print(f"!!! Erreur création dossier instance {app.instance_path}: {e} !!!")


# --- Initialisation de la Base de Données via le module database ---
database.init_app(app) # APPEL IMPORTANT

# --- Fonctions CRUD pour la Base de Données ---
# Toutes les fonctions (get_db, close_connection, init_db, create_session, etc.)
# ont été DÉPLACÉES vers database.py


# --- Fonction Utile pour Extraire le Choix ---
# (Conservée ici car spécifique à la logique du chat ?)
# Ou pourrait être déplacée si on crée un module ai_interface.py plus tard.
def extract_choice_text(letter, history):
    if not history: return None
    for i in range(len(history) - 1, -1, -1):
        if history[i].get("role") == "assistant":
            pattern = re.compile(r"^\s*" + re.escape(letter) + r"\)\s*(.*?)\s*(?:\n|$)", re.M | re.I)
            match = pattern.search(history[i].get("content", ""))
            if match and match.group(1).strip():
                return match.group(1).strip()
            return None
    return None

# --- Routes ---

@app.route('/')
def index():
    """Route principale affichant l'interface."""
    if not THEME_DATA: return "Erreur: Thèmes non chargés.", 500
    # Passer les thèmes au template
    return render_template('index.html', themes=THEMES)

@app.route('/sessions', methods=['GET'])
def api_get_sessions():
    """API pour obtenir la liste des sessions."""
    try:
        # Utilise la fonction importée
        sessions = database.get_all_sessions()
        return jsonify(sessions)
    except Exception as e:
        # Log l'erreur spécifique si possible
        print(f"!!! Erreur inattendue dans api_get_sessions: {e}")
        return jsonify({"error": "Erreur serveur lors de la récupération des sessions."}), 500


@app.route('/sessions/<int:session_id>', methods=['GET', 'DELETE'])
def api_manage_session(session_id):
    """API pour obtenir les détails ou supprimer une session."""
    if request.method == 'GET':
        # Utilise la fonction importée
        session_details = database.get_session_details(session_id)
        if session_details:
            return jsonify(session_details)
        else: return jsonify({"error":"Session non trouvée"}), 404
    elif request.method == 'DELETE':
        # Utilise la fonction importée
        success = database.delete_session(session_id)
        if success: return jsonify({"message":"Supprimée"}), 200
        else:
            # Vérifier si elle existe encore pour distinguer 404 de 500
            session_exists_check = database.get_session_details(session_id)
            if session_exists_check is None:
                 return jsonify({"error":"Non trouvée"}), 404
            else:
                 # L'erreur de suppression a été loggée dans database.py
                 return jsonify({"error":"Erreur interne lors de la suppression"}), 500

# --- Route pour le Chat ---
@app.route('/chat', methods=['POST'])
def chat_handler():
    """Gère les échanges de messages avec l'IA pour une session."""
    if not GEMINI_API_KEY_FROM_ENV or not THEME_DATA:
        return jsonify({"error": "Configuration serveur incomplète (API Key ou Thèmes)."}), 500

    try:
        data = request.json
        if not data: return jsonify({"error": "Requête JSON vide ou invalide."}), 400

        user_message_input = data.get('message')
        history_from_client = data.get('history', [])
        theme_name = data.get('theme')
        age_group = data.get('ageGroup')
        gender = data.get('gender')
        player_name = data.get('playerName')
        turn_count = data.get('turnCount')
        session_id = data.get('session_id')

        print(f"--- /chat Reçu (SessID: {session_id}, Theme: {theme_name}, Turns: {turn_count}) ---")
        if not user_message_input: return jsonify({"error": "Message utilisateur manquant."}), 400

        model = genai.GenerativeModel(GEMINI_MODEL_NAME)
        message_to_send_to_ai = user_message_input
        is_starting_message = False
        converted_history = []
        current_session_id = session_id
        cleaned_player_name = None
        selected_turn_count = None

        # --- Logique de Démarrage (Nouvelle partie) ---
        if not current_session_id and theme_name and age_group and gender and player_name and turn_count is not None:
            is_starting_message = True
            print(f"--- Nouvelle Session Détectée: Thème={theme_name}, Nom={player_name}, Tours={turn_count} ---")

            # Validations (inchangées)
            if not player_name or len(player_name.strip()) == 0: return jsonify({"error": "Nom du joueur invalide."}), 400
            cleaned_player_name = player_name.strip()
            theme_info = THEME_DATA.get(theme_name)
            if not theme_info: return jsonify({"error": f"Thème '{theme_name}' invalide."}), 400
            try:
                selected_turn_count = int(turn_count)
                if not (MIN_TURNS <= selected_turn_count <= MAX_TURNS): raise ValueError()
            except: return jsonify({"error": f"Nombre de tours invalide (doit être entre {MIN_TURNS}-{MAX_TURNS})."}), 400

            # Construction du Prompt Initial (inchangée)
            base_prompt = theme_info['prompt']
            age_instruction = AGE_INSTRUCTIONS.get(age_group, AGE_INSTRUCTIONS["Adulte"])
            gender_instruction = GENDER_INSTRUCTIONS.get(gender, GENDER_INSTRUCTIONS["Garçon"])
            name_instruction = PLAYER_NAME_INSTRUCTION_TEMPLATE.format(player_name=cleaned_player_name)
            turn_instruction = TURN_COUNT_INSTRUCTION_TEMPLATE.format(turn_count=selected_turn_count)
            final_prompt_parts = [ LANGUAGE_INSTRUCTION, age_instruction, gender_instruction, name_instruction, turn_instruction, "---", base_prompt ]
            final_prompt = "\n\n".join(final_prompt_parts)
            print(f"--- Prompt initial construit (Tours: {selected_turn_count}) ---")
            message_to_send_to_ai = final_prompt
            chat_session = model.start_chat(history=[])

        # --- Logique de Continuation (Partie existante) ---
        elif current_session_id:
            print(f"--- Continuation Session ID: {current_session_id} ---")
            if history_from_client is None: return jsonify({"error": "Historique manquant."}), 400
            message_to_send_to_ai = user_message_input.strip()
            for entry in history_from_client:
                role = entry.get("role"); content = entry.get("content")
                if role and content is not None:
                    sdk_role = "user" if role == "user" else "model"
                    converted_history.append({'role': sdk_role, 'parts': [content]})
                else: print(f"!!! Attention: Entrée historique invalide ignorée: {entry}")
            print(f"--- Démarrage chat avec {len(converted_history)} messages historiques ---")
            chat_session = model.start_chat(history=converted_history)

        # --- Cas d'Erreur: Contexte Invalide ---
        else:
             print(f"!!! Requête invalide: Manque Session ID ou infos Nouvelle Partie")
             return jsonify({"error": "Requête invalide: Contexte manquant."}), 400

        # --- Envoyer à l'IA ---
        if not message_to_send_to_ai: return jsonify({"error": "Message AI vide."}), 500
        print(f"--- Envoi Gemini ('{message_to_send_to_ai[:50]}...') ---")
        response = chat_session.send_message(message_to_send_to_ai)

        # --- Traitement Réponse IA (inchangé) ---
        ai_response = ""
        try:
             ai_response = response.text
             print(f"--- Réponse Gemini reçue (via .text) ---")
        except Exception as e:
             print(f"!!! Erreur accès .text réponse Gemini: {e} - Vérification alternative...")
             try:
                 if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
                     ai_response = " ".join([part.text for part in response.candidates[0].content.parts if hasattr(part, 'text')])
                     print(f"--- Réponse Gemini reconstruite depuis parts ---")
                 else:
                     finish_reason_value = response.candidates[0].finish_reason if response.candidates else 0
                     finish_reason_enum = genai.types.FinishReason(finish_reason_value) if finish_reason_value in [e.value for e in genai.types.FinishReason] else None
                     finish_reason_name = finish_reason_enum.name if finish_reason_enum else 'UNKNOWN'
                     if finish_reason_name == 'SAFETY': ai_response = "[Contenu bloqué par sécurité]"
                     elif finish_reason_name == 'RECITATION': ai_response = "[Contenu bloqué (Réciation)]"
                     else: ai_response = "[Erreur réception réponse IA]"
                     print(f"!!! Réponse Gemini non textuelle ou bloquée. Reason: {finish_reason_name} ({finish_reason_value})")
             except Exception as inner_e:
                 print(f"!!! Erreur interne traitement alternatif réponse Gemini: {inner_e}")
                 ai_response = "[Erreur interne traitement réponse IA]"

        # --- Préparer l'historique mis à jour (inchangé) ---
        updated_history_for_client = []
        for entry in chat_session.history:
            if not entry.parts: continue
            client_role = "user" if entry.role == "user" else "assistant"
            client_content = entry.parts[0].text if entry.parts and hasattr(entry.parts[0], 'text') else "[Contenu vide/non textuel]"
            updated_history_for_client.append({"role": client_role, "content": client_content})

        # --- Sauvegarde en Base de Données (UTILISE LES FONCTIONS IMPORTÉES) ---
        if is_starting_message and cleaned_player_name and selected_turn_count is not None:
            # Utilise la fonction importée
            new_session_id = database.create_session(
                cleaned_player_name, theme_name, age_group, gender,
                selected_turn_count,
                updated_history_for_client
            )
            if new_session_id:
                current_session_id = new_session_id
            else:
                # L'erreur est loggée dans database.py
                return jsonify({"error": "Erreur création session DB."}), 500
        elif current_session_id:
            # Utilise la fonction importée
            update_success = database.update_session_history(current_session_id, updated_history_for_client)
            if not update_success:
                # L'erreur est loggée dans database.py
                print(f"!!! Échec maj hist. session {current_session_id} (erreur loggée dans module DB) !!!")
                # Continuer quand même

        # --- Préparer la réponse JSON (inchangée) ---
        response_payload = {
            "reply": ai_response,
            "history": updated_history_for_client,
            "session_id": current_session_id
        }
        print(f"--- Réponse envoyée au client (SessID: {current_session_id}) ---")
        return jsonify(response_payload)

    # --- Gestion des Erreurs (inchangée) ---
    except genai.types.generation_types.BlockedPromptException as e:
         print(f"!!! Erreur Gemini: Prompt Bloqué - {e}")
         return jsonify({"error": "Message bloqué par sécurité.", "history": history_from_client, "session_id": session_id}), 400
    except genai.types.generation_types.StopCandidateException as e:
         print(f"!!! Erreur Gemini: Génération Interrompue - {e}")
         return jsonify({"error": "Génération IA interrompue.", "history": history_from_client, "session_id": session_id}), 500
    except sqlite3.Error as db_err: # Capturer les erreurs DB remontées par database.py
        print(f"!!! ERREUR SQLite remontée dans /chat: {db_err} !!!")
        import traceback; traceback.print_exc()
        return jsonify({"error": "Erreur base de données.", "history": history_from_client, "session_id": session_id}), 500
    except Exception as e:
        error_type_name = type(e).__name__
        print(f"!!! ERREUR Inattendue /chat ({error_type_name}): {e} !!!")
        import traceback; traceback.print_exc()
        error_message = f"Erreur interne serveur ({error_type_name})."
        error_str = str(e).lower()
        if "api key" in error_str: error_message = "Erreur auth IA."
        elif "model not found" in error_str: error_message = f"Modèle IA '{GEMINI_MODEL_NAME}' indisponible."
        elif "deadline exceeded" in error_str or "timeout" in error_str: error_message = "Timeout IA."
        elif "resource exhausted" in error_str: error_message = "Quota IA atteint."
        return jsonify({"error": error_message, "history": history_from_client, "session_id": session_id}), 500


# --- Démarrage de l'application ---
if __name__ == '__main__':
    if not GEMINI_API_KEY_FROM_ENV or not THEME_DATA:
        print("\n*** ERREUR CRITIQUE: Config API Key ou Thèmes manquante. Serveur non démarré. ***\n")
    else:
        port_to_use = int(os.getenv('PORT', 5002))
        debug_mode = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'
        use_reloader = os.getenv('FLASK_USE_RELOADER', 'false').lower() == 'true' and debug_mode

        print(f"--- Serveur Flask prêt ---")
        print(f"    Mode Debug: {'Activé' if debug_mode else 'Désactivé'}")
        print(f"    Reloader: {'Activé' if use_reloader else 'Désactivé'}")
        print(f"    Accès via: http://0.0.0.0:{port_to_use}")
        app.run(host='0.0.0.0', port=port_to_use, debug=debug_mode, use_reloader=use_reloader)