package com.reypez.camaras;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin propio: guardar en la galería y compartir por WhatsApp.
        registerPlugin(GaleriaPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
