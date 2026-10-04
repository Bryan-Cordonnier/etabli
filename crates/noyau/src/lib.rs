//! Règles communes à l'application de bureau et au serveur facultatif (docs/16) : ce qui décide
//! si un nom, un document ou un paquet de plugin est acceptable. Aucune entrée-sortie ici : des
//! fonctions pures, testées, que chaque côté appelle avant de toucher au disque ou à la base.

pub mod catalogue;
pub mod cles;
pub mod document;
pub mod identifiants;
pub mod paquet;
pub mod source;
