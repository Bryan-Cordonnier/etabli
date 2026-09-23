// Empêche l'ouverture d'une console à côté de la fenêtre en production. À ne pas retirer.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    etabli_lib::run();
}
