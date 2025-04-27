# app.py
import os
import re
import json
import datetime
import sqlite3 # Import sqlite3 pour la gestion d'erreur spécifique
from flask import Flask, request, jsonify, render_template
import google.generativeai as genai
from dotenv import load_dotenv

# Importer depuis les modules locaux
import database


from prompts import (
    THEMES, AGE_INSTRUCTIONS, GENDER_INSTRUCTIONS,
    PLAYER_NAME_INSTRUCTION_TEMPLATE, FORMAT_CHOIX_INSTRUCTION, TONE_TWIST_INSTRUCTION,
    TURN_COUNT_INSTRUCTION_TEMPLATE, LANGUAGE_INSTRUCTION,
    IMMERSION_INSTRUCTION, INVENTORY_INSTRUCTION, NPC_INSTRUCTION
)

# --- Configuration ---
load_dotenv()
GEMINI_API_KEY_FROM_ENV = os.getenv("GEMINI_API_KEY")
DEFAULT_MODEL = "gemini-1.5-flash-latest" # Modèle par défaut mis à jour
GEMINI_MODEL_NAME = os.getenv("GEMINI_MODEL", DEFAULT_MODEL)
THEME_DATA = {}
MIN_TURNS = 10
MAX_TURNS = 20

# --- Configuration Initiale et Vérifications Thèmes/API Key ---
try:
    THEME_DATA = {theme['name']: theme for theme in THEMES} # cite: 9
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
    DATABASE=os.path.join(app.instance_path, database.DATABASE) # cite: 10
)
# S'assurer que le dossier d'instance existe (utile pour la DB SQLite)
try:
    os.makedirs(app.instance_path, exist_ok=True)
    print(f"--- Dossier d'instance assuré: {app.instance_path} ---")
except OSError as e:
    print(f"!!! Erreur création dossier instance {app.instance_path}: {e} !!!")


# --- Initialisation de la Base de Données via le module database ---
database.init_app(app) # cite: 10

# --- Fonctions CRUD pour la Base de Données ---
# DÉPLACÉES vers database.py


# --- Fonction Utile pour Extraire le Choix ---
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
    return render_template('index.html', themes=THEMES) # cite: 6, 9

@app.route('/sessions', methods=['GET'])
def api_get_sessions():
    """API pour obtenir la liste des sessions."""
    try:
        sessions = database.get_all_sessions() # cite: 10
        return jsonify(sessions)
    except Exception as e:
        print(f"!!! Erreur inattendue dans api_get_sessions: {e}")
        return jsonify({"error": "Erreur serveur lors de la récupération des sessions."}), 500


@app.route('/sessions/<int:session_id>', methods=['GET', 'DELETE'])
def api_manage_session(session_id):
    """API pour obtenir les détails ou supprimer une session."""
    if request.method == 'GET':
        session_details = database.get_session_details(session_id) # cite: 10
        if session_details:
            return jsonify(session_details)
        else: return jsonify({"error":"Session non trouvée"}), 404
    elif request.method == 'DELETE':
        success = database.delete_session(session_id) # cite: 10
        if success: return jsonify({"message":"Supprimée"}), 200
        else:
            session_exists_check = database.get_session_details(session_id) # cite: 10
            if session_exists_check is None:
                 return jsonify({"error":"Non trouvée"}), 404
            else:
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

        print(f"--- /chat Reçu (SessID: {session_id}, Theme: {theme_name}, Turns_start: {turn_count}) ---")
        if not user_message_input and session_id:
             return jsonify({"error": "Message utilisateur manquant pour continuer la session."}), 400

        model = genai.GenerativeModel(GEMINI_MODEL_NAME)
        message_to_send_to_ai = user_message_input
        is_starting_message = False
        converted_history = []
        current_session_id = session_id
        cleaned_player_name = None
        selected_turn_count = None
        total_turns_for_reminder = 0

        # --- Logique de Démarrage (Nouvelle partie) ---
        if not current_session_id and theme_name and age_group and gender and player_name and turn_count is not None:
            is_starting_message = True
            print(f"--- Nouvelle Session Détectée: Thème={theme_name}, Nom={player_name}, Tours={turn_count} ---")

            # Validations
            if not player_name or len(player_name.strip()) == 0: return jsonify({"error": "Nom du joueur invalide."}), 400
            cleaned_player_name = player_name.strip()
            theme_info = THEME_DATA.get(theme_name) # cite: 9
            if not theme_info: return jsonify({"error": f"Thème '{theme_name}' invalide."}), 400
            try:
                selected_turn_count = int(turn_count)
                if not (MIN_TURNS <= selected_turn_count <= MAX_TURNS): raise ValueError()
                total_turns_for_reminder = selected_turn_count
            except (ValueError, TypeError): return jsonify({"error": f"Nombre de tours invalide (doit être entre {MIN_TURNS}-{MAX_TURNS})."}), 400

            # Construction du Prompt Initial
            base_prompt = theme_info['prompt'] # cite: 9
            age_instruction = AGE_INSTRUCTIONS.get(age_group, AGE_INSTRUCTIONS["Adulte"]) # cite: 9
            gender_instruction = GENDER_INSTRUCTIONS.get(gender, GENDER_INSTRUCTIONS["Garçon"]) # cite: 9
            name_instruction = PLAYER_NAME_INSTRUCTION_TEMPLATE.format(player_name=cleaned_player_name) # cite: 9
            turn_instruction = TURN_COUNT_INSTRUCTION_TEMPLATE.format(turn_count=selected_turn_count) # cite: 9

            final_prompt_parts = [
                base_prompt, "---", FORMAT_CHOIX_INSTRUCTION, TONE_TWIST_INSTRUCTION, # cite: 9
                LANGUAGE_INSTRUCTION, IMMERSION_INSTRUCTION, INVENTORY_INSTRUCTION, NPC_INSTRUCTION,# cite: 9
                age_instruction, gender_instruction, name_instruction, turn_instruction
            ]
            final_prompt = "\n\n".join(final_prompt_parts)
            print(f"--- Prompt initial construit (Tours: {selected_turn_count}) ---")
            message_to_send_to_ai = final_prompt
            chat_session = model.start_chat(history=[])

        # --- Logique de Continuation (Partie existante) ---
        elif current_session_id:
            print(f"--- Continuation Session ID: {current_session_id} ---")
            if history_from_client is None: return jsonify({"error": "Historique manquant pour continuer la session."}), 400
            if not user_message_input: return jsonify({"error": "Message utilisateur manquant pour continuer la session."}), 400
            message_to_send_to_ai_raw = user_message_input.strip()

            # Convertir l'historique client en format SDK
            for entry in history_from_client:
                role = entry.get("role"); content = entry.get("content")
                if role and content is not None:
                    sdk_role = "user" if role == "user" else "model"
                    converted_history.append({'role': sdk_role, 'parts': [content]})
                else: print(f"!!! Attention: Entrée historique invalide ignorée: {entry}")

            # Récupérer le nombre total de tours prévu
            session_details = database.get_session_details(current_session_id) # cite: 10
            if session_details and session_details.get('initial_turn_count'):
                total_turns_for_reminder = session_details['initial_turn_count']
            else:
                 total_turns_for_reminder = 0
                 print(f"!!! Attention: Impossible de récupérer initial_turn_count pour session {current_session_id}")

            # Calculer le tour actuel
            current_turn = len([msg for msg in converted_history if msg['role'] == 'model']) + 1

            # *** DÉBUT MODIFICATION POUR CONCLUSION FORCÉE ***
            # Construire le rappel de tour
            turn_reminder = ""
            if total_turns_for_reminder > 0:
                 # Cas 1: Dépassement du nombre de tours
                 if current_turn > total_turns_for_reminder:
                      turn_reminder = f"[Rappel Narrateur : URGENT - Le nombre de tours prévu ({total_turns_for_reminder}) est dépassé (Tour {current_turn}). Conclus l'histoire à ce tour !]\n\n"
                 # Cas 2: Dans les 3 derniers tours
                 elif (total_turns_for_reminder - current_turn) <= 3:
                      turn_reminder = f"[Rappel Narrateur : Tour {current_turn}/{total_turns_for_reminder}. L'aventure doit bientôt se conclure.]\n\n"
                 # Cas 3: Tours normaux (avant les 3 derniers)
                 else:
                      turn_reminder = f"[Rappel Narrateur : Tour {current_turn}/{total_turns_for_reminder}]\n\n"

                 print(f"--- Ajout Rappel Tour: {turn_reminder.strip()} ---")
                 message_to_send_to_ai = turn_reminder + message_to_send_to_ai_raw
            else:
                 # Si pas de total_turns connu, on n'ajoute pas de rappel
                 message_to_send_to_ai = message_to_send_to_ai_raw
            # *** FIN MODIFICATION POUR CONCLUSION FORCÉE ***

            print(f"--- Démarrage chat avec {len(converted_history)} messages historiques ---")
            chat_session = model.start_chat(history=converted_history)

        # --- Cas d'Erreur: Contexte Invalide ---
        else:
             print(f"!!! Requête invalide: Manque Session ID ou infos Nouvelle Partie complètes")
             return jsonify({"error": "Requête invalide: Contexte manquant (ni session existante, ni création complète)."}), 400

        # --- Envoyer à l'IA ---
        if not message_to_send_to_ai:
             print("!!! Erreur: Message à envoyer à l'IA est vide avant l'envoi.")
             return jsonify({"error": "Erreur interne: Message AI vide."}), 500

        print(f"--- Envoi Gemini ('{message_to_send_to_ai[:70]}...') ---")
        response = chat_session.send_message(message_to_send_to_ai)

        # --- Traitement Réponse IA ---
        ai_response = ""
        try:
             ai_response = response.text
             print(f"--- Réponse Gemini reçue (via .text) ---")
        except Exception as e:
             print(f"!!! Erreur accès .text réponse Gemini: {e} - Vérification alternative via candidates...")
             try:
                 if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
                     ai_response = " ".join([part.text for part in response.candidates[0].content.parts if hasattr(part, 'text')])
                     print(f"--- Réponse Gemini reconstruite depuis parts ---")
                 else:
                     finish_reason_value = response.candidates[0].finish_reason if response.candidates else 0
                     finish_reason_enum = None
                     try: finish_reason_enum = genai.types.FinishReason(finish_reason_value)
                     except ValueError: pass
                     finish_reason_name = finish_reason_enum.name if finish_reason_enum else 'UNKNOWN'
                     print(f"!!! Réponse Gemini non textuelle ou bloquée. Reason: {finish_reason_name} ({finish_reason_value})")
                     if finish_reason_name == 'SAFETY': ai_response = "[Le contenu de la réponse a été bloqué pour des raisons de sécurité.]"
                     elif finish_reason_name == 'RECITATION': ai_response = "[Le contenu de la réponse a été bloqué car il s'agissait de récitation.]"
                     elif finish_reason_name == 'MAX_TOKENS': ai_response = "[La réponse a été coupée car elle était trop longue.]"
                     else: ai_response = "[Erreur lors de la réception de la réponse de l'IA.]"
             except Exception as inner_e:
                 print(f"!!! Erreur interne traitement alternatif réponse Gemini: {inner_e}")
                 ai_response = "[Erreur interne lors du traitement de la réponse de l'IA.]"

        # --- Préparer l'historique mis à jour pour le client ---
        updated_history_for_client = []
        for entry in chat_session.history:
            if not entry.parts or not hasattr(entry.parts[0], 'text'):
                print(f"!!! Attention: Entrée historique SDK sans texte valide ignorée: {entry}")
                continue
            client_role = "user" if entry.role == "user" else "assistant"
            client_content = entry.parts[0].text
            if client_role == "user" and client_content.startswith("[Rappel Narrateur"):
                 original_message_start = client_content.find("\n\n")
                 if original_message_start != -1:
                      client_content = client_content[original_message_start + 2:]
            updated_history_for_client.append({"role": client_role, "content": client_content})

        # --- Sauvegarde en Base de Données ---
        if is_starting_message and cleaned_player_name and selected_turn_count is not None:
            new_session_id = database.create_session( # cite: 10
                cleaned_player_name, theme_name, age_group, gender,
                total_turns_for_reminder,
                updated_history_for_client
            )
            if new_session_id:
                current_session_id = new_session_id
            else:
                return jsonify({"error": "Erreur lors de la création de la session dans la base de données."}), 500
        elif current_session_id:
            update_success = database.update_session_history(current_session_id, updated_history_for_client) # cite: 10
            if not update_success:
                print(f"!!! Échec mise à jour historique session {current_session_id} (erreur loggée dans module DB) !!!")

        # --- Préparer la réponse JSON ---
        response_payload = {
            "reply": ai_response,
            "history": updated_history_for_client,
            "session_id": current_session_id
        }
        print(f"--- Réponse envoyée au client (SessID: {current_session_id}) ---")
        return jsonify(response_payload)

    # --- Gestion des Erreurs Spécifiques Gemini et Générales ---
    except genai.types.generation_types.BlockedPromptException as e:
         print(f"!!! Erreur Gemini: Prompt Bloqué - {e}")
         return jsonify({"error": "Votre message a été bloqué par les filtres de sécurité.", "history": history_from_client, "session_id": session_id}), 400
    except genai.types.generation_types.StopCandidateException as e:
         print(f"!!! Erreur Gemini: Génération Interrompue (StopCandidateException) - {e}")
         return jsonify({"error": "La génération de la réponse IA a été interrompue.", "history": history_from_client, "session_id": session_id}), 500
    except sqlite3.Error as db_err: # cite: 10
        print(f"!!! ERREUR SQLite remontée dans /chat: {db_err} !!!")
        import traceback; traceback.print_exc()
        return jsonify({"error": "Erreur lors de l'accès à la base de données.", "history": history_from_client, "session_id": session_id}), 500
    except Exception as e:
        error_type_name = type(e).__name__
        print(f"!!! ERREUR Inattendue /chat ({error_type_name}): {e} !!!")
        import traceback; traceback.print_exc()
        error_message = f"Une erreur interne inattendue est survenue ({error_type_name})."
        error_str = str(e).lower()
        if "api key not valid" in error_str: error_message = "Erreur d'authentification avec l'API IA. Vérifiez la clé."
        elif "model not found" in error_str: error_message = f"Le modèle IA spécifié ('{GEMINI_MODEL_NAME}') n'a pas été trouvé ou n'est pas disponible."
        elif "deadline exceeded" in error_str or "timeout" in error_str: error_message = "Le service IA n'a pas répondu dans les délais."
        elif "resource exhausted" in error_str or "quota" in error_str: error_message = "Le quota d'utilisation de l'API IA a été atteint."
        return jsonify({"error": error_message, "history": history_from_client, "session_id": session_id}), 500


# --- Démarrage de l'application ---
if __name__ == '__main__':
    if not GEMINI_API_KEY_FROM_ENV or not THEME_DATA:
        print("\n*****************************************************************")
        print("*** ERREUR CRITIQUE: Configuration API Key ou Thèmes manquante. ***")
        print("*** Le serveur ne peut pas démarrer correctement.             ***")
        print("*****************************************************************\n")
    else:
        port_to_use = int(os.getenv('PORT', 5002))
        debug_mode = os.getenv('FLASK_DEBUG', 'false').lower() in ('true', '1', 't')
        use_reloader = os.getenv('FLASK_USE_RELOADER', str(debug_mode)).lower() in ('true', '1', 't')

        print(f"--- Serveur Flask prêt ---")
        print(f"    Mode Debug: {'Activé' if debug_mode else 'Désactivé'}")
        print(f"    Reloader: {'Activé' if use_reloader else 'Désactivé'}")
        print(f"    Accès via: http://127.0.0.1:{port_to_use} ou http://0.0.0.0:{port_to_use}")
        app.run(host='0.0.0.0', port=port_to_use, debug=debug_mode, use_reloader=use_reloader)

# --- FIN app.py ---