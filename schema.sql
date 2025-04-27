-- schema.sql
-- Ce script est destiné à être utilisé avec `flask init-db` pour une réinitialisation COMPLÈTE.
-- Il supprime l'ancienne table et la recrée avec la nouvelle colonne.
DROP TABLE IF EXISTS sessions;

CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- Identifiant unique de la session
    player_name TEXT NOT NULL,            -- Nom du joueur
    theme TEXT NOT NULL,                  -- Thème choisi
    age_group TEXT NOT NULL,              -- Groupe d'âge (Enfant/Adulte)
    gender TEXT NOT NULL,                 -- Genre (Garçon/Fille)
    initial_turn_count INTEGER,           -- Nombre de tours visé au début (AJOUT)
    last_played TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, -- Date/heure dernière interaction
    history TEXT                          -- Historique de la conversation (stocké en JSON)
);

-- Optionnel: Créer un index pour accélérer la recherche par nom ou date
-- CREATE INDEX idx_sessions_player_name ON sessions (player_name);
-- CREATE INDEX idx_sessions_last_played ON sessions (last_played);