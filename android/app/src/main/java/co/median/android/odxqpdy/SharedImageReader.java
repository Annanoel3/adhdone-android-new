package co.median.android.odxqpdy;

import android.content.ContentResolver;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.util.Base64;
import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * Turns an image shared from another app into the { base64, mimeType } payload the web
 * app's SharedImageReceiver expects.
 *
 * A content:// URI handed over by the share sheet is readable by this process (the share
 * grants temporary read permission for the life of the receiving activity) but NOT by the
 * WebView, so the bytes have to cross the bridge already encoded.
 *
 * Everything runs off the main thread and the image is downscaled before encoding: a
 * 12 MP photo would otherwise produce a ~8 MB base64 string, which risks an OOM and would
 * be slow to push through the bridge. The result is re-compressed JPEG, which is what the
 * downstream readImageCapture OCR wants anyway.
 */
public final class SharedImageReader {

    private static final String TAG = "ADHDone";

    /** Longest edge after downscaling. Comfortably enough for OCR of a screenshot or flyer. */
    private static final int MAX_DIMENSION = 1600;
    private static final int JPEG_QUALITY = 85;

    private SharedImageReader() {
    }

    /**
     * Read, downscale and re-compress a shared image to JPEG bytes, on the calling
     * thread. Null when it can't be read. CaptureActivity uses this to queue a shared
     * screenshot without the app ever opening.
     */
    static byte[] readJpeg(Context context, Uri uri) {
        if (uri == null) {
            return null;
        }
        try {
            Bitmap bitmap = decodeDownscaled(context.getApplicationContext(), uri);
            if (bitmap == null) {
                Log.w(TAG, "SharedImageReader: could not decode shared image");
                return null;
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out);
            bitmap.recycle();
            return out.toByteArray();
        } catch (OutOfMemoryError e) {
            Log.e(TAG, "SharedImageReader: out of memory reading shared image");
        } catch (SecurityException e) {
            Log.w(TAG, "SharedImageReader: no read access to shared image: " + e.getMessage());
        } catch (Exception e) {
            Log.w(TAG, "SharedImageReader: failed to read shared image: " + e.getMessage());
        }
        return null;
    }

    /** Read, downscale and encode on a background thread, then hand to ShareBridge. */
    static void deliverAsync(Context context, Uri uri) {
        if (uri == null) {
            return;
        }
        final Context appContext = context.getApplicationContext();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    String mimeType = appContext.getContentResolver().getType(uri);
                    if (mimeType == null || !mimeType.startsWith("image/")) {
                        mimeType = "image/jpeg";
                    }

                    Bitmap bitmap = decodeDownscaled(appContext, uri);
                    if (bitmap == null) {
                        Log.w(TAG, "SharedImageReader: could not decode shared image");
                        return;
                    }

                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out);
                    bitmap.recycle();

                    byte[] jpeg = out.toByteArray();
                    String base64 = Base64.encodeToString(jpeg, Base64.NO_WRAP);

                    Log.d(TAG, "SharedImageReader: encoded shared image ("
                            + jpeg.length + " bytes jpeg, " + base64.length() + " chars base64)");
                    // Always re-compressed to JPEG above, so report that rather than the
                    // source type — the web app uses mimeType to name and type the upload.
                    ShareBridge.deliverImage(base64, "image/jpeg");
                } catch (OutOfMemoryError e) {
                    Log.e(TAG, "SharedImageReader: out of memory reading shared image");
                } catch (SecurityException e) {
                    Log.w(TAG, "SharedImageReader: no read access to shared image: " + e.getMessage());
                } catch (Exception e) {
                    Log.w(TAG, "SharedImageReader: failed to read shared image: " + e.getMessage());
                }
            }
        }, "adhdone-shared-image").start();
    }

    /** Two-pass decode: measure bounds, pick an inSampleSize, then scale precisely. */
    private static Bitmap decodeDownscaled(Context context, Uri uri) throws Exception {
        ContentResolver resolver = context.getContentResolver();

        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream in = resolver.openInputStream(uri)) {
            if (in == null) {
                return null;
            }
            BitmapFactory.decodeStream(in, null, bounds);
        }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
            return null;
        }

        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = computeInSampleSize(bounds.outWidth, bounds.outHeight);
        Bitmap decoded;
        try (InputStream in = resolver.openInputStream(uri)) {
            if (in == null) {
                return null;
            }
            decoded = BitmapFactory.decodeStream(in, null, opts);
        }
        if (decoded == null) {
            return null;
        }

        // inSampleSize only halves, so finish the job exactly if still oversized.
        int w = decoded.getWidth();
        int h = decoded.getHeight();
        int longest = Math.max(w, h);
        if (longest <= MAX_DIMENSION) {
            return decoded;
        }
        float ratio = (float) MAX_DIMENSION / (float) longest;
        int targetW = Math.max(1, Math.round(w * ratio));
        int targetH = Math.max(1, Math.round(h * ratio));
        Bitmap scaled = Bitmap.createScaledBitmap(decoded, targetW, targetH, true);
        if (scaled != decoded) {
            decoded.recycle();
        }
        return scaled;
    }

    private static int computeInSampleSize(int width, int height) {
        int sample = 1;
        int longest = Math.max(width, height);
        while (longest / (sample * 2) >= MAX_DIMENSION) {
            sample *= 2;
        }
        return sample;
    }
}
