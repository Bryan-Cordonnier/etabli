-- Schéma 1 du serveur Établi.
CREATE TABLE utilisateurs (
    id                 TEXT PRIMARY KEY,
    nom                TEXT NOT NULL UNIQUE COLLATE NOCASE,
    mot_de_passe       TEXT NOT NULL,                       -- Argon2id (jamais en clair)
    role               TEXT NOT NULL CHECK (role IN ('admin', 'utilisateur')),
    actif              INTEGER NOT NULL DEFAULT 1,
    cree               INTEGER NOT NULL,
    derniere_connexion INTEGER
);
-- Un seul administrateur, garanti par la base elle-même.
CREATE UNIQUE INDEX un_seul_admin ON utilisateurs(role) WHERE role = 'admin';

CREATE TABLE sessions (
    empreinte            TEXT PRIMARY KEY,                  -- SHA-256 du jeton ; le jeton n'est jamais stocké
    utilisateur_id       TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    cree                 INTEGER NOT NULL,
    derniere_utilisation INTEGER NOT NULL
);
CREATE INDEX sessions_utilisateur ON sessions(utilisateur_id);

CREATE TABLE documents (
    utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    id             TEXT NOT NULL,
    plugin_id      TEXT NOT NULL,
    app_id         TEXT NOT NULL,
    data_version   INTEGER NOT NULL,
    titre          TEXT NOT NULL,
    resume         TEXT NOT NULL,
    cree           INTEGER NOT NULL,
    modifie        INTEGER NOT NULL,
    version        INTEGER NOT NULL,                        -- augmente à chaque enregistrement (détection des conflits)
    app_version    TEXT NOT NULL,
    data           TEXT NOT NULL,
    supprime       INTEGER,                                 -- corbeille : date de suppression, sinon NULL
    PRIMARY KEY (utilisateur_id, id)
);
CREATE INDEX documents_liste ON documents(utilisateur_id, modifie DESC);

CREATE TABLE donnees (
    utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    nom            TEXT NOT NULL,
    valeur         TEXT NOT NULL,
    version        INTEGER NOT NULL,
    modifie        INTEGER NOT NULL,
    PRIMARY KEY (utilisateur_id, nom)
);

CREATE TABLE reglages (
    utilisateur_id TEXT PRIMARY KEY REFERENCES utilisateurs(id) ON DELETE CASCADE,
    valeur         TEXT NOT NULL,
    modifie        INTEGER NOT NULL
);

CREATE TABLE plugins (
    id           TEXT PRIMARY KEY,
    version      TEXT NOT NULL,
    manifeste    TEXT NOT NULL,
    actif_global INTEGER NOT NULL DEFAULT 1,                -- 1 : pour tous ; 0 : seulement les utilisateurs de plugin_acces
    installe     INTEGER NOT NULL
);

CREATE TABLE plugin_acces (
    plugin_id      TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
    utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    PRIMARY KEY (plugin_id, utilisateur_id)
);

CREATE TABLE configuration (
    cle    TEXT PRIMARY KEY,
    valeur TEXT NOT NULL
);

CREATE TABLE journal (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    horodatage  INTEGER NOT NULL,
    acteur      TEXT,
    action      TEXT NOT NULL,
    cible       TEXT,
    detail      TEXT
);
