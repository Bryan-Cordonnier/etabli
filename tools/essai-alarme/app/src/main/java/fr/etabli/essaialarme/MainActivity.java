package fr.etabli.essaialarme;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * Essai d'alarme natif, sans Capacitor ni aucune bibliothèque. Question posée : une alarme programmée avec les API
 * système prévues pour les réveils sonne-t-elle à l'heure, application fermée, écran verrouillé ?
 */
public class MainActivity extends Activity {
    private TextView etat;
    private TextView journal;
    private EditText minutes;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        LinearLayout racine = new LinearLayout(this);
        racine.setOrientation(LinearLayout.VERTICAL);
        int m = (int) (16 * getResources().getDisplayMetrics().density);
        racine.setPadding(m, m, m, m);

        etat = new TextView(this);
        racine.addView(etat);

        racine.addView(bouton("1. Autoriser les notifications", v -> demanderNotifications()));
        racine.addView(bouton("2. Autoriser les alarmes exactes", v -> demanderAlarmesExactes()));
        racine.addView(bouton("3. (Option) Ne pas optimiser la batterie", v -> demanderBatterie()));

        TextView invite = new TextView(this);
        invite.setText("\nDans combien de minutes ?");
        racine.addView(invite);
        minutes = new EditText(this);
        minutes.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        minutes.setText("2");
        racine.addView(minutes);

        TextView titreNotif = new TextView(this);
        titreNotif.setText("\nNOTIFICATIONS ordinaires (son de notification)");
        racine.addView(titreNotif);
        racine.addView(bouton("Notification immédiate", v -> {
            AlarmReceiver.afficher(this, "immédiate", System.currentTimeMillis(), 3, true);
            rafraichir();
        }));
        racine.addView(bouton("Programmer : notification dans N min (application fermée)", v -> programmer("notification", 4)));

        TextView titreAlarme = new TextView(this);
        titreAlarme.setText("\nALARMES (sonnerie d'alarme)");
        racine.addView(titreAlarme);
        racine.addView(bouton("Programmer : réveil (setAlarmClock)", v -> programmer("setAlarmClock", 1)));
        racine.addView(bouton("Programmer : exacte en veille (setExactAndAllowWhileIdle)", v -> programmer("setExactAndAllowWhileIdle", 2)));
        racine.addView(bouton("Annuler les alarmes", v -> annuler()));
        racine.addView(bouton("Rafraîchir le journal", v -> rafraichir()));
        racine.addView(bouton("Vider le journal", v -> {
            Journal.vider(this);
            rafraichir();
        }));

        journal = new TextView(this);
        journal.setTextIsSelectable(true);
        racine.addView(journal);

        ScrollView defilement = new ScrollView(this);
        defilement.addView(racine);
        setContentView(defilement);
    }

    @Override
    protected void onResume() {
        super.onResume();
        rafraichir();
    }

    private Button bouton(String texte, View.OnClickListener action) {
        Button bt = new Button(this);
        bt.setText(texte);
        bt.setAllCaps(false);
        bt.setOnClickListener(action);
        return bt;
    }

    private AlarmManager gestionnaire() {
        return (AlarmManager) getSystemService(Context.ALARM_SERVICE);
    }

    private boolean notificationsAutorisees() {
        return Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean alarmesExactesAutorisees() {
        return Build.VERSION.SDK_INT < 31 || gestionnaire().canScheduleExactAlarms();
    }

    private boolean batterieLibre() {
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        return pm.isIgnoringBatteryOptimizations(getPackageName());
    }

    private void rafraichir() {
        etat.setText("Android " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ") — " + Build.MANUFACTURER + " " + Build.MODEL
                + "\nNotifications : " + (notificationsAutorisees() ? "autorisées" : "NON autorisées")
                + "\nAlarmes exactes : " + (alarmesExactesAutorisees() ? "autorisées" : "NON autorisées")
                + "\nBatterie non optimisée : " + (batterieLibre() ? "oui" : "non"));
        StringBuilder sb = new StringBuilder("\nJournal (le plus récent en haut) :\n");
        for (String l : Journal.lire(this)) sb.append("• ").append(l).append("\n\n");
        journal.setText(sb);
    }

    private void demanderNotifications() {
        if (Build.VERSION.SDK_INT >= 33) requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, 1);
        rafraichir();
    }

    private void demanderAlarmesExactes() {
        if (Build.VERSION.SDK_INT >= 31 && !gestionnaire().canScheduleExactAlarms()) {
            startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getPackageName())));
        }
    }

    private void demanderBatterie() {
        startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName())));
    }

    private PendingIntent intention(String mode, long prevu, int id) {
        Intent i = new Intent(this, AlarmReceiver.class);
        if (mode.equals("notification")) i.putExtra(AlarmReceiver.EXTRA_TYPE, AlarmReceiver.TYPE_NOTIF);
        i.putExtra(AlarmReceiver.EXTRA_MODE, mode);
        i.putExtra(AlarmReceiver.EXTRA_PREVU, prevu);
        i.putExtra(AlarmReceiver.EXTRA_ID, id);
        return PendingIntent.getBroadcast(this, id, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private void programmer(String mode, int id) {
        int min;
        try {
            min = Integer.parseInt(minutes.getText().toString().trim());
        } catch (NumberFormatException e) {
            min = 2;
        }
        min = Math.max(1, Math.min(min, 24 * 60));
        long prevu = System.currentTimeMillis() + min * 60_000L;
        try {
            if (mode.equals("setAlarmClock")) {
                PendingIntent ouvrir = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
                gestionnaire().setAlarmClock(new AlarmManager.AlarmClockInfo(prevu, ouvrir), intention(mode, prevu, id));
            } else {
                // « notification » et « setExactAndAllowWhileIdle » : alarme exacte qui réveille l'appareil en veille.
                gestionnaire().setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, prevu, intention(mode, prevu, id));
            }
            Journal.ajouter(this, "PROGRAMMÉE " + mode + " pour " + Journal.heure(prevu) + " (dans " + min + " min)");
        } catch (SecurityException e) {
            Journal.ajouter(this, "REFUSÉE " + mode + " : " + e.getMessage());
        }
        rafraichir();
    }

    private void annuler() {
        gestionnaire().cancel(intention("setAlarmClock", 0, 1));
        gestionnaire().cancel(intention("setExactAndAllowWhileIdle", 0, 2));
        gestionnaire().cancel(intention("notification", 0, 4));
        Journal.ajouter(this, "ANNULÉES");
        rafraichir();
    }
}
