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
    static final String EXTRA_MODE = "mode";
    static final String EXTRA_PREVU = "prevu";
    static final String EXTRA_ID = "id";

    @Override
    public void onReceive(Context c, Intent i) {
        long maintenant = System.currentTimeMillis();
        long prevu = i.getLongExtra(EXTRA_PREVU, maintenant);
        String mode = i.getStringExtra(EXTRA_MODE);
        int id = i.getIntExtra(EXTRA_ID, 1);
        long retard = (maintenant - prevu) / 1000;
        Journal.ajouter(c, "SONNÉE " + mode + " : prévue " + Journal.heure(prevu) + ", reçue " + Journal.heure(maintenant)
                + " (retard " + retard + " s)");

        NotificationManager nm = c.getSystemService(NotificationManager.class);
        Uri son = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        NotificationChannel canal = new NotificationChannel(CANAL, "Essai d'alarme", NotificationManager.IMPORTANCE_HIGH);
        canal.setSound(son, new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());
        canal.enableVibration(true);
        nm.createNotificationChannel(canal);

        Intent ouvrir = new Intent(c, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(c, 0, ouvrir, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new Notification.Builder(c, CANAL)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle("Essai d'alarme (" + mode + ")")
                .setContentText("Prévue " + Journal.heure(prevu) + " — retard " + retard + " s")
                .setCategory(Notification.CATEGORY_ALARM)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
        nm.notify(id, n);
    }
}
