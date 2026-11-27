package com.reypez.camaras;

import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

/**
 * Guarda fotos y clips en la galería del teléfono (DCIM/Camaras Rey Pez),
 * donde los ve Google Fotos, y los comparte directo por WhatsApp.
 * En Android 10 o más nuevo no pide permisos.
 */
@CapacitorPlugin(name = "Galeria")
public class GaleriaPlugin extends Plugin {

    private static final String CARPETA = "Camaras Rey Pez";

    @PluginMethod
    public void guardar(PluginCall call) {
        String data = call.getString("data");
        String mime = call.getString("mime", "image/jpeg");
        String nombre = call.getString("nombre");
        if (data == null || nombre == null) {
            call.reject("Faltan datos");
            return;
        }
        byte[] bytes;
        try {
            bytes = Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("Datos inválidos");
            return;
        }
        if (bytes.length == 0) {
            call.reject("El archivo quedó vacío");
            return;
        }
        boolean video = mime.startsWith("video/");
        ContentResolver cr = getContext().getContentResolver();
        try {
            Uri uri;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, nombre);
                v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DCIM + "/" + CARPETA);
                v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                Uri coleccion = video
                    ? MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                    : MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                uri = cr.insert(coleccion, v);
                if (uri == null) throw new IOException("no se pudo crear el archivo");
                try (OutputStream out = cr.openOutputStream(uri)) {
                    if (out == null) throw new IOException("no se pudo escribir");
                    out.write(bytes);
                }
                ContentValues listo = new ContentValues();
                listo.put(MediaStore.MediaColumns.IS_PENDING, 0);
                cr.update(uri, listo, null, null);
            } else {
                // Android 9 o anterior: archivo normal + aviso a la galería.
                File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM), CARPETA);
                if (!dir.exists() && !dir.mkdirs()) throw new IOException("sin permiso de almacenamiento");
                File f = new File(dir, nombre);
                try (FileOutputStream out = new FileOutputStream(f)) {
                    out.write(bytes);
                }
                MediaScannerConnection.scanFile(getContext(), new String[] { f.getAbsolutePath() }, new String[] { mime }, null);
                uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
            }
            JSObject r = new JSObject();
            r.put("uri", uri.toString());
            r.put("carpeta", "DCIM/" + CARPETA);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("No se pudo guardar en la galería: " + e.getMessage());
        }
    }

    @PluginMethod
    public void whatsapp(PluginCall call) {
        String u = call.getString("uri");
        if (u == null) {
            call.reject("Falta el archivo");
            return;
        }
        Intent i = new Intent(Intent.ACTION_SEND);
        i.setType(call.getString("mime", "*/*"));
        i.putExtra(Intent.EXTRA_STREAM, Uri.parse(u));
        String texto = call.getString("texto");
        if (texto != null) i.putExtra(Intent.EXTRA_TEXT, texto);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        // WhatsApp normal, luego WhatsApp Business; si no hay, el menú de compartir.
        for (String pkg : new String[] { "com.whatsapp", "com.whatsapp.w4b" }) {
            try {
                i.setPackage(pkg);
                getActivity().startActivity(i);
                JSObject r = new JSObject();
                r.put("app", pkg);
                call.resolve(r);
                return;
            } catch (ActivityNotFoundException ignored) {
                // probar la siguiente
            }
        }
        i.setPackage(null);
        getActivity().startActivity(Intent.createChooser(i, "Compartir"));
        JSObject r = new JSObject();
        r.put("app", "menu");
        call.resolve(r);
    }
}
