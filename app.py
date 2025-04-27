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
    PLAYER_NAME_INSTRUCTION_TEMPLATE, FORMAT_CHOIX_INSTRUCTION, TONE_TWIST_INSTRUCTION,
    TURN_COUNT_INSTRUCTION_TEMPLATE, LANGUAGE_INSTRUCTION, 
    IMMERSION_INSTRUCTION 
)

# --- Configuration ---
load_dotenv()
GEMINI_API_KEY_FROM_ENV = os.getenv("GEMINI_API_KEY")
DEFAULT_MODEL = "gemini-1.5-flash-latest" # Modèle par défaut mis à jour
GEMINI_MODEL_NAME = os.getenv("GEMINI_MODEL", DEFAULT_MODEL)
THEME_DATA = {}
# DATABASE = 'sessions.db' # Défini dans database.py maintenant
# LANGUAGE_INSTRUCTION = "..." # Déplacé dans prompts.py
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
            # Si on trouve le rôle assistant mais pas le pattern, on arrête de chercher plus loin
            # car le choix doit être dans la dernière réponse de l'assistant
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
        # Le message peut être vide si c'est le début d'une partie (le prompt initial est généré)
        # Mais il ne doit pas être vide si on continue une partie
        if not user_message_input and session_id:
             return jsonify({"error": "Message utilisateur manquant pour continuer la session."}), 400

        model = genai.GenerativeModel(GEMINI_MODEL_NAME)
        message_to_send_to_ai = user_message_input # Sera écrasé si c'est une nouvelle partie
        is_starting_message = False
        converted_history = []
        current_session_id = session_id
        cleaned_player_name = None
        selected_turn_count = None

        # --- Logique de Démarrage (Nouvelle partie) ---
        if not current_session_id and theme_name and age_group and gender and player_name and turn_count is not None:
            is_starting_message = True
            print(f"--- Nouvelle Session Détectée: Thème={theme_name}, Nom={player_name}, Tours={turn_count} ---")

            # Validations
            if not player_name or len(player_name.strip()) == 0: return jsonify({"error": "Nom du joueur invalide."}), 400
            cleaned_player_name = player_name.strip()
            theme_info = THEME_DATA.get(theme_name)
            if not theme_info: return jsonify({"error": f"Thème '{theme_name}' invalide."}), 400
            try:
                selected_turn_count = int(turn_count)
                if not (MIN_TURNS <= selected_turn_count <= MAX_TURNS): raise ValueError()
            except (ValueError, TypeError): return jsonify({"error": f"Nombre de tours invalide (doit être entre {MIN_TURNS}-{MAX_TURNS})."}), 400

            # Construction du Prompt Initial (MODIFIÉE pour inclure IMMERSION_INSTRUCTION)
            # Note: L'ordre a été modifié dans une réponse précédente pour mettre le thème en premier.
            # Je remets ici la version qui était dans le contexte initial pour comparaison.
            base_prompt = theme_info['prompt']
            age_instruction = AGE_INSTRUCTIONS.get(age_group, AGE_INSTRUCTIONS["Adulte"])
            gender_instruction = GENDER_INSTRUCTIONS.get(gender, GENDER_INSTRUCTIONS["Garçon"])
            name_instruction = PLAYER_NAME_INSTRUCTION_TEMPLATE.format(player_name=cleaned_player_name)
            turn_instruction = TURN_COUNT_INSTRUCTION_TEMPLATE.format(turn_count=selected_turn_count)

            # Ordre tel que fourni dans le contexte initial
            final_prompt_parts = [
                base_prompt,
                "---", # Séparateur
                FORMAT_CHOIX_INSTRUCTION,
                TONE_TWIST_INSTRUCTION,
                LANGUAGE_INSTRUCTION,
                IMMERSION_INSTRUCTION, # <-- AJOUTÉ ICI
                age_instruction,
                gender_instruction,
                name_instruction,
                turn_instruction   
            ]
            final_prompt = "\n\n".join(final_prompt_parts)
            print(f"--- Prompt initial construit (Tours: {selected_turn_count}) ---")
            message_to_send_to_ai = final_prompt # Le message initial est le prompt construit
            chat_session = model.start_chat(history=[]) # L'historique est vide au début

        # --- Logique de Continuation (Partie existante) ---
        elif current_session_id:
            print(f"--- Continuation Session ID: {current_session_id} ---")
            if history_from_client is None: return jsonify({"error": "Historique manquant pour continuer la session."}), 400
            if not user_message_input: return jsonify({"error": "Message utilisateur manquant pour continuer la session."}), 400 # Redondant mais sûr
            message_to_send_to_ai = user_message_input.strip()

            # Convertir l'historique du client au format SDK Gemini
            for entry in history_from_client:
                role = entry.get("role"); content = entry.get("content")
                if role and content is not None:
                    # Le SDK attend 'user' ou 'model'
                    sdk_role = "user" if role == "user" else "model"
                    converted_history.append({'role': sdk_role, 'parts': [content]})
                else: print(f"!!! Attention: Entrée historique invalide ignorée: {entry}")
            print(f"--- Démarrage chat avec {len(converted_history)} messages historiques ---")
            chat_session = model.start_chat(history=converted_history)

        # --- Cas d'Erreur: Contexte Invalide ---
        else:
             # Ce cas ne devrait pas arriver si les vérifications précédentes sont correctes
             # (soit on a session_id, soit on a les infos pour une nouvelle partie)
             print(f"!!! Requête invalide: Manque Session ID ou infos Nouvelle Partie complètes")
             return jsonify({"error": "Requête invalide: Contexte manquant (ni session existante, ni création complète)."}), 400

        # --- Envoyer à l'IA ---
        if not message_to_send_to_ai:
             # Cela peut arriver si le prompt initial est vide pour une raison inconnue
             print("!!! Erreur: Message à envoyer à l'IA est vide avant l'envoi.")
             return jsonify({"error": "Erreur interne: Message AI vide."}), 500

        print(f"--- Envoi Gemini ('{message_to_send_to_ai[:50]}...') ---")
        response = chat_session.send_message(message_to_send_to_ai)

        # --- Traitement Réponse IA ---
        ai_response = ""
        try:
             # Accès direct via .text est le plus simple
             ai_response = response.text
             print(f"--- Réponse Gemini reçue (via .text) ---")
        except Exception as e:
             print(f"!!! Erreur accès .text réponse Gemini: {e} - Vérification alternative via candidates...")
             try:
                 # Plan B: Parcourir les 'parts' du premier candidat
                 if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
                     ai_response = " ".join([part.text for part in response.candidates[0].content.parts if hasattr(part, 'text')])
                     print(f"--- Réponse Gemini reconstruite depuis parts ---")
                 else:
                     # Plan C: Vérifier la raison de fin si pas de contenu
                     finish_reason_value = response.candidates[0].finish_reason if response.candidates else 0
                     # Convertir la valeur numérique en enum si possible
                     finish_reason_enum = None
                     try:
                         finish_reason_enum = genai.types.FinishReason(finish_reason_value)
                     except ValueError:
                         pass # La valeur n'est pas dans l'enum connu

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
        # Utiliser chat_session.history qui contient maintenant la dernière réponse de l'IA
        updated_history_for_client = []
        for entry in chat_session.history:
            # S'assurer qu'il y a des 'parts' et que la première a du texte
            if not entry.parts or not hasattr(entry.parts[0], 'text'):
                print(f"!!! Attention: Entrée historique SDK sans texte valide ignorée: {entry}")
                continue
            client_role = "user" if entry.role == "user" else "assistant"
            client_content = entry.parts[0].text
            updated_history_for_client.append({"role": client_role, "content": client_content})

        # --- Sauvegarde en Base de Données (UTILISE LES FONCTIONS IMPORTÉES) ---
        if is_starting_message and cleaned_player_name and selected_turn_count is not None:
            # Utilise la fonction importée pour créer la session
            new_session_id = database.create_session(
                cleaned_player_name, theme_name, age_group, gender,
                selected_turn_count,
                updated_history_for_client # Sauvegarder l'historique initial (prompt + 1ère réponse)
            )
            if new_session_id:
                current_session_id = new_session_id # Mettre à jour l'ID pour la réponse
            else:
                # L'erreur est loggée dans database.py
                return jsonify({"error": "Erreur lors de la création de la session dans la base de données."}), 500
        elif current_session_id:
            # Utilise la fonction importée pour mettre à jour l'historique
            update_success = database.update_session_history(current_session_id, updated_history_for_client)
            if not update_success:
                # L'erreur est loggée dans database.py
                print(f"!!! Échec mise à jour historique session {current_session_id} (erreur loggée dans module DB) !!!")
                # On peut choisir de continuer quand même et renvoyer la réponse au client
                # ou retourner une erreur. Pour l'instant, on continue.

        # --- Préparer la réponse JSON ---
        response_payload = {
            "reply": ai_response,
            "history": updated_history_for_client,
            "session_id": current_session_id # Renvoyer l'ID (nouveau ou existant)
        }
        print(f"--- Réponse envoyée au client (SessID: {current_session_id}) ---")
        return jsonify(response_payload)

    # --- Gestion des Erreurs Spécifiques Gemini et Générales ---
    except genai.types.generation_types.BlockedPromptException as e:
         print(f"!!! Erreur Gemini: Prompt Bloqué - {e}")
         # Renvoyer l'historique tel qu'il était avant l'envoi bloqué
         return jsonify({"error": "Votre message a été bloqué par les filtres de sécurité.", "history": history_from_client, "session_id": session_id}), 400
    except genai.types.generation_types.StopCandidateException as e:
         # Souvent lié à SAFETY ou RECITATION, déjà géré dans le bloc try/except de la réponse
         print(f"!!! Erreur Gemini: Génération Interrompue (StopCandidateException) - {e}")
         # Renvoyer l'historique tel qu'il était avant l'envoi
         return jsonify({"error": "La génération de la réponse IA a été interrompue.", "history": history_from_client, "session_id": session_id}), 500
    except sqlite3.Error as db_err: # Capturer les erreurs DB remontées par database.py
        print(f"!!! ERREUR SQLite remontée dans /chat: {db_err} !!!")
        import traceback; traceback.print_exc()
        # Renvoyer l'historique tel qu'il était avant l'opération DB échouée
        return jsonify({"error": "Erreur lors de l'accès à la base de données.", "history": history_from_client, "session_id": session_id}), 500
    except Exception as e:
        error_type_name = type(e).__name__
        print(f"!!! ERREUR Inattendue /chat ({error_type_name}): {e} !!!")
        import traceback; traceback.print_exc()
        error_message = f"Une erreur interne inattendue est survenue ({error_type_name})."
        # Essayer de donner des messages plus spécifiques pour les erreurs courantes d'API
        error_str = str(e).lower()
        if "api key not valid" in error_str: error_message = "Erreur d'authentification avec l'API IA. Vérifiez la clé."
        elif "model not found" in error_str: error_message = f"Le modèle IA spécifié ('{GEMINI_MODEL_NAME}') n'a pas été trouvé ou n'est pas disponible."
        elif "deadline exceeded" in error_str or "timeout" in error_str: error_message = "Le service IA n'a pas répondu dans les délais."
        elif "resource exhausted" in error_str or "quota" in error_str: error_message = "Le quota d'utilisation de l'API IA a été atteint."
        # Renvoyer l'historique tel qu'il était avant l'erreur
        return jsonify({"error": error_message, "history": history_from_client, "session_id": session_id}), 500


# --- Démarrage de l'application ---
if __name__ == '__main__':
    if not GEMINI_API_KEY_FROM_ENV or not THEME_DATA:
        print("\n*****************************************************************")
        print("*** ERREUR CRITIQUE: Configuration API Key ou Thèmes manquante. ***")
        print("*** Le serveur ne peut pas démarrer correctement.             ***")
        print("*****************************************************************\n")
        # Optionnel: exit(1) pour arrêter complètement si c'est préférable
    else:
        # Utiliser des variables d'environnement pour configurer le port et le mode debug
        port_to_use = int(os.getenv('PORT', 5002)) # Port par défaut 5002 si non défini
        debug_mode = os.getenv('FLASK_DEBUG', 'false').lower() in ('true', '1', 't')
        # Le reloader est souvent activé par défaut en mode debug, mais on peut le forcer
        use_reloader = os.getenv('FLASK_USE_RELOADER', str(debug_mode)).lower() in ('true', '1', 't')

        print(f"--- Serveur Flask prêt ---")
        print(f"    Mode Debug: {'Activé' if debug_mode else 'Désactivé'}")
        print(f"    Reloader: {'Activé' if use_reloader else 'Désactivé'}")
        print(f"    Accès via: http://127.0.0.1:{port_to_use} ou http://0.0.0.0:{port_to_use}")
        # host='0.0.0.0' pour écouter sur toutes les interfaces réseau disponibles
        app.run(host='0.0.0.0', port=port_to_use, debug=debug_mode, use_reloader=use_reloader)
