# database.py
import sqlite3
import os
import json
from flask import g, current_app, Flask # Import Flask pour type hinting et init_app

DATABASE = 'sessions.db' # Définit le chemin ici

def get_db():
    """Ouvre une nouvelle connexion à la base de données si aucune n'existe pour le contexte actuel."""
    if 'db' not in g:
        db_path = os.path.join(current_app.instance_path, DATABASE) if hasattr(current_app, 'instance_path') else DATABASE
        # Assurer que le répertoire existe (si instance_path est utilisé)
        db_dir = os.path.dirname(db_path)
        if db_dir and not os.path.exists(db_dir):
            try:
                os.makedirs(db_dir)
                print(f"--- Répertoire DB créé: {db_dir} ---")
            except OSError as e:
                 print(f"!!! Erreur création répertoire DB {db_dir}: {e} !!!")
                 # Lever l'erreur ou retourner None pour indiquer un problème ? Levons pour l'instant.
                 raise e

        # Connecter à la base de données
        try:
            g.db = sqlite3.connect(db_path, detect_types=sqlite3.PARSE_DECLTYPES)
            g.db.row_factory = sqlite3.Row
            print(f"--- Connexion DB établie: {db_path} ---")
        except sqlite3.Error as e:
            print(f"!!! Erreur connexion DB {db_path}: {e} !!!")
            raise e # Rendre l'erreur visible à l'appelant

    return g.db

def close_connection(exception=None):
    """Ferme la connexion à la base de données à la fin de la requête."""
    db = g.pop('db', None)
    if db is not None:
        db.close()
        print("--- Connexion DB fermée ---")

def init_db(app: Flask):
    """Initialise la base de données en créant la table sessions et la colonne si elles n'existent pas."""
    with app.app_context(): # Utilise le contexte de l'application passée
        db = get_db()
        try:
            print("--- Vérification/Création table 'sessions' (si inexistante)... ---")
            db.execute('''
                CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    player_name TEXT NOT NULL,
                    theme TEXT NOT NULL,
                    age_group TEXT NOT NULL,
                    gender TEXT NOT NULL,
                    initial_turn_count INTEGER,
                    last_played TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    history TEXT
                )
            ''')
            # Vérifier si la colonne existe et l'ajouter si besoin (migration simple)
            cursor = db.execute("PRAGMA table_info(sessions)")
            columns = [column['name'] for column in cursor.fetchall()]
            if 'initial_turn_count' not in columns:
                print("--- Ajout de la colonne 'initial_turn_count' à la table 'sessions'... ---")
                db.execute('ALTER TABLE sessions ADD COLUMN initial_turn_count INTEGER')
            db.commit()
            print("--- Table 'sessions' vérifiée/mise à jour. ---")
        except sqlite3.Error as e:
            print(f"!!! Erreur lors de l'initialisation/migration simple de la DB: {e} !!!")

def init_db_command_func():
    """Fonction pour la commande CLI qui réinitialise la DB via schema.sql."""
    # On a besoin du contexte de l'application ici aussi
    # Cette commande est enregistrée via init_app
    db = get_db()
    schema_path = os.path.join(os.path.dirname(__file__), 'schema.sql') # Chemin relatif à ce fichier
    print(f"--- Réinitialisation DB via {schema_path} (EFFACEMENT DONNÉES)... ---")
    try:
        # Utiliser open() standard car open_resource est lié au contexte de l'app Flask
        with open(schema_path, mode='r') as f:
            script = f.read()
            # S'assurer qu'on a bien une connexion avant d'exécuter
            if db:
                db.cursor().executescript(script)
                db.commit()
                print("--- Base de données réinitialisée. ---")
            else:
                print("!!! Erreur: Impossible d'obtenir une connexion DB pour exécuter le script. !!!")
    except sqlite3.Error as e:
        print(f"!!! Erreur lors de l'exécution de {schema_path}: {e} !!!")
        db.rollback() # Essayer de rollback en cas d'erreur
    except FileNotFoundError:
        print(f"!!! Erreur: {schema_path} non trouvé. Impossible de réinitialiser. !!!")
    except Exception as e:
        print(f"!!! Erreur inattendue pendant init-db: {e}")
        if db: db.rollback()


def create_session(player_name, theme, age_group, gender, initial_turn_count, history):
    """Crée une nouvelle session dans la base de données."""
    db = get_db()
    sql = '''INSERT INTO sessions (player_name, theme, age_group, gender, initial_turn_count, history)
             VALUES (?, ?, ?, ?, ?, ?)'''
    try:
        cursor = db.execute(
            sql,
            (player_name, theme, age_group, gender, initial_turn_count, json.dumps(history))
        )
        db.commit()
        session_id = cursor.lastrowid
        print(f"--- DB: Nouvelle session créée (ID: {session_id}) ---")
        return session_id
    except sqlite3.Error as e:
        print(f"!!! Erreur DB (create_session): {e} !!!")
        db.rollback()
        return None

def get_all_sessions():
    """Récupère les informations de base de toutes les sessions."""
    db = get_db()
    sql = 'SELECT id, player_name, theme, last_played FROM sessions ORDER BY last_played DESC'
    try:
        sessions = db.execute(sql).fetchall()
        print(f"--- DB: Récupéré {len(sessions)} sessions ---")
        return [dict(session) for session in sessions]
    except sqlite3.Error as e:
        print(f"!!! Erreur DB (get_all_sessions): {e} !!!")
        return []

def get_session_details(session_id):
    """Récupère toutes les données d'une session spécifique."""
    db = get_db()
    sql = '''SELECT id, player_name, theme, age_group, gender, initial_turn_count, last_played, history
             FROM sessions WHERE id = ?'''
    try:
        session = db.execute(sql, (session_id,)).fetchone()
        if session:
            print(f"--- DB: Détails session {session_id} trouvés ---")
            session_dict = dict(session)
            try:
                 session_dict['history'] = json.loads(session_dict['history'] or '[]')
            except (json.JSONDecodeError, TypeError) as json_e:
                 print(f"!!! Attention: Erreur décodage JSON hist. session {session_id}: {json_e} !!!")
                 session_dict['history'] = []
            if 'initial_turn_count' not in session_dict or session_dict['initial_turn_count'] is None:
                 session_dict['initial_turn_count'] = 0 # Fournir une valeur par défaut
            return session_dict
        else:
            print(f"--- DB: Session {session_id} non trouvée ---")
            return None
    except sqlite3.Error as e:
        print(f"!!! Erreur DB (get_session_details ID {session_id}): {e} !!!")
        return None

def update_session_history(session_id, history):
    """Met à jour l'historique et le timestamp d'une session."""
    db = get_db()
    sql = 'UPDATE sessions SET history = ?, last_played = CURRENT_TIMESTAMP WHERE id = ?'
    try:
        cursor = db.execute(sql, (json.dumps(history), session_id))
        db.commit()
        if cursor.rowcount > 0:
             # print(f"--- DB: Session {session_id} mise à jour ---") # Optionnel
             return True
        else:
             print(f"!!! DB: Session {session_id} non trouvée pour mise à jour !!!")
             return False # Indique que la mise à jour n'a pas eu lieu
    except sqlite3.Error as e:
        print(f"!!! Erreur DB (update ID {session_id}): {e} !!!")
        db.rollback()
        return False

def delete_session(session_id):
    """Supprime une session de la base de données."""
    db = get_db()
    sql = 'DELETE FROM sessions WHERE id = ?'
    try:
        cursor = db.execute(sql, (session_id,))
        db.commit()
        deleted_count = cursor.rowcount
        if deleted_count > 0:
            print(f"--- DB: Session {session_id} supprimée ---")
            return True
        else:
            print(f"--- DB: Session {session_id} non trouvée pour suppression ---")
            return False
    except sqlite3.Error as e:
        print(f"!!! Erreur DB (delete ID {session_id}): {e} !!!")
        db.rollback()
        return False

# Fonction pour enregistrer les gestionnaires DB avec l'app Flask
def init_app(app: Flask):
    """Enregistre les fonctions de gestion de la base de données avec l'instance Flask."""
    # Assurer que la DB est initialisée au démarrage de l'application
    init_db(app)

    # Fermer la connexion DB après chaque requête
    app.teardown_appcontext(close_connection)

    # Ajouter la commande CLI `flask init-db`
    # Utiliser une fonction wrapper pour s'assurer qu'on a le contexte de l'app
    @app.cli.command('init-db')
    def init_db_command_wrapper():
        """Réinitialise la base de données (EFFACE LES DONNÉES)."""
        with app.app_context(): # Assurer le contexte pour get_db
             init_db_command_func()

    print("--- Gestionnaire DB enregistré avec l'application Flask ---")