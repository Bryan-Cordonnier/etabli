//! Flux des changements (SSE) : un appareil connecté est prévenu quand un autre appareil du même utilisateur enregistre une
//! donnée. Le serveur ne garde rien de plus : l'appareil relit alors la donnée avec la route habituelle.

use crate::{auth::Session, etat::Etat};
use axum::{
    extract::State,
    response::sse::{Event, KeepAlive, Sse},
};
use serde_json::json;
use std::convert::Infallible;
use tokio_stream::{wrappers::BroadcastStream, Stream, StreamExt};

pub async fn flux(
    State(etat): State<Etat>,
    session: Session,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let moi = session.utilisateur_id;
    let flux = BroadcastStream::new(etat.evenements.subscribe()).filter_map(move |e| {
        // Un retard (canal saturé) ou un changement d'un autre utilisateur : rien à envoyer.
        let e = e.ok()?;
        (e.utilisateur_id == moi).then(|| {
            Ok(Event::default().data(json!({ "type": e.genre, "nom": e.nom }).to_string()))
        })
    });
    Sse::new(flux).keep_alive(KeepAlive::default())
}
