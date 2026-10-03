package fr.etabli.essaialarme;

import android.content.Context;
import android.content.SharedPreferences;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/** Journal des alarmes programmées et déclenchées, gardé même application fermée (SharedPreferences). */
final class Journal {
    private static final String FICHIER = "journal";
    private static final String CLE = "lignes";
    private static final int MAX = 40;
    private static final SimpleDateFormat HEURE = new SimpleDateFormat("dd/MM HH:mm:ss", Locale.FRANCE);

    private Journal() {}

    static String heure(long ms) {
        synchronized (HEURE) {
            return HEURE.format(new Date(ms));
        }
    }

    /** Ajoute une ligne en tête ; les plus anciennes sont oubliées. */
    static synchronized void ajouter(Context c, String ligne) {
        SharedPreferences p = c.getSharedPreferences(FICHIER, Context.MODE_PRIVATE);
        List<String> lignes = lire(c);
        lignes.add(0, ligne);
        while (lignes.size() > MAX) lignes.remove(lignes.size() - 1);
        p.edit().putString(CLE, String.join("\n", lignes)).apply();
    }

    static synchronized List<String> lire(Context c) {
        String brut = c.getSharedPreferences(FICHIER, Context.MODE_PRIVATE).getString(CLE, "");
        List<String> lignes = new ArrayList<>();
        if (brut != null && !brut.isEmpty()) for (String l : brut.split("\n")) lignes.add(l);
        return lignes;
    }

    static synchronized void vider(Context c) {
        c.getSharedPreferences(FICHIER, Context.MODE_PRIVATE).edit().clear().apply();
    }
}
