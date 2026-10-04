package fr.etabli.essaialarme;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;

/** Reçoit l'alarme, affiche la notification et note l'heure réelle de déclenchement (donc le retard). */
public class AlarmReceiver extends BroadcastReceiver {
    static final String CANAL = "essai-alarme";
    /** Canal d'une notification ordinaire (son de notification, pas de sonnerie d'alarme). */
    static final String CANAL_NOTIF = "essai-notification";
    static final String EXTRA_TYPE = "type";
    static final String TYPE_NOTIF = "notification";
    static final String EXTRA_MODE = "mode";
    static final String EXTRA_PREVU = "prevu";
    static final String EXTRA_ID = "id";

    @Override
    public void onReceive(Context c, Intent i) {
        long maintenant = System.currentTimeMillis();
        long prevu = i.getLongExtra(EXTRA_PREVU, maintenant);
        afficher(c, i.getStringExtra(EXTRA_MODE), prevu, i.getIntExtra(EXTRA_ID, 1), TYPE_NOTIF.equals(i.getStringExtra(EXTRA_TYPE)));
    }

    /** Affiche la notification (alarme sonore ou notification ordinaire) et note l'heure réelle, donc le retard. */
    static void afficher(Context c, String mode, long prevu, int id, boolean ordinaire) {
        long maintenant = System.currentTimeMillis();
        long retard = (maintenant - prevu) / 1000;
        Journal.ajouter(c, (ordinaire ? "NOTIFICATION " : "SONNÉE ") + mode + " : prévue " + Journal.heure(prevu) + ", reçue "
                + Journal.heure(maintenant) + " (retard " + retard + " s)");

        NotificationManager nm = c.getSystemService(NotificationManager.class);
        String canalId = ordinaire ? CANAL_NOTIF : CANAL;
        NotificationChannel canal;
        if (ordinaire) {
            canal = new NotificationChannel(CANAL_NOTIF, "Essai de notification", NotificationManager.IMPORTANCE_DEFAULT);
        } else {
            Uri son = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            canal = new NotificationChannel(CANAL, "Essai d'alarme", NotificationManager.IMPORTANCE_HIGH);
            canal.setSound(son, new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());
            canal.enableVibration(true);
        }
        nm.createNotificationChannel(canal);

        Intent ouvrir = new Intent(c, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(c, 0, ouvrir, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = new Notification.Builder(c, canalId)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle((ordinaire ? "Essai de notification (" : "Essai d'alarme (") + mode + ")")
                .setContentText("Prévue " + Journal.heure(prevu) + " — retard " + retard + " s")
                .setContentIntent(pi)
                .setAutoCancel(true);
        if (!ordinaire) b.setCategory(Notification.CATEGORY_ALARM);
        nm.notify(id, b.build());
    }
}
