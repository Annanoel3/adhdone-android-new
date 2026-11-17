package co.median.android.odxqpdy;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.os.SystemClock;
import android.text.TextPaint;
import android.text.TextUtils;
import android.util.AttributeSet;
import android.util.TypedValue;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;

/**
 * The Later bar on the alarm screen (build 49 on). It has to be HELD: the bar
 * fills from the left while a finger stays on it and Later happens when it is
 * full. Anna, Nov 16 2026: "I keep pressing later without even reading the
 * alarm. Pure adhd." (half her alarms were cleared within five seconds). The
 * task's name is written on the bar, so the thing the thumb rests on is the
 * thing to read.
 *
 * A quick tap does nothing but tell the screen, which says to keep holding.
 * The fill runs on the clock, not on an animator, so a phone with animations
 * switched off still needs the full hold. A screen reader's double tap (or a
 * keyboard's Enter) counts as the hold: performClick().
 */
public class HoldLaterView extends View {

    interface Listener {
        void onHeld();

        void onTapped();
    }

    static final long HOLD_MS = 700L;
    private static final long DRAIN_MS = 220L;
    private static final long TAP_MS = 300L;
    private static final int IDLE = 0;
    private static final int FILLING = 1;
    private static final int DRAINING = 2;

    private final Paint base = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint border = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final TextPaint labelPaint = new TextPaint(Paint.ANTI_ALIAS_FLAG);
    private final TextPaint subPaint = new TextPaint(Paint.ANTI_ALIAS_FLAG);
    private final RectF box = new RectF();
    private final Path shape = new Path();
    private String label = "";
    private String sub = "";
    private float progress = 0f;
    private float from = 0f;
    private int mode = IDLE;
    private long modeAt = 0L;
    private boolean down = false;
    private boolean held = false;
    private long downAt = 0L;
    private Listener listener;

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            long now = SystemClock.uptimeMillis();
            if (mode == FILLING) {
                progress = Math.min(1f, from + (now - modeAt) / (float) HOLD_MS);
                invalidate();
                if (progress >= 1f) {
                    mode = IDLE;
                    finishHold();
                    return;
                }
                postOnAnimation(this);
            } else if (mode == DRAINING) {
                progress = Math.max(0f, from - (now - modeAt) / (float) DRAIN_MS);
                invalidate();
                if (progress <= 0f) {
                    mode = IDLE;
                    return;
                }
                postOnAnimation(this);
            }
        }
    };

    public HoldLaterView(Context context) {
        super(context);
        init();
    }

    public HoldLaterView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    public HoldLaterView(Context context, AttributeSet attrs, int defStyleAttr) {
        super(context, attrs, defStyleAttr);
        init();
    }

    private void init() {
        base.setStyle(Paint.Style.FILL);
        base.setColor(0x21FFFFFF);
        fill.setStyle(Paint.Style.FILL);
        fill.setColor(0x8CE879AA);
        border.setStyle(Paint.Style.STROKE);
        border.setStrokeWidth(dp(1.5f));
        border.setColor(0x57FFFFFF);
        labelPaint.setColor(Color.WHITE);
        labelPaint.setTypeface(Typeface.DEFAULT_BOLD);
        labelPaint.setTextSize(sp(22f));
        labelPaint.setTextAlign(Paint.Align.CENTER);
        subPaint.setColor(Color.WHITE);
        subPaint.setTextSize(sp(15.5f));
        subPaint.setTextAlign(Paint.Align.CENTER);
        setFocusable(true);
        setClickable(true);
    }

    private float dp(float v) {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private float sp(float v) {
        // A very large system font is held back, so the two lines stay on the bar.
        float scale = Math.min(getResources().getConfiguration().fontScale, 1.3f);
        return dp(v) * scale;
    }

    private static float lineHeight(Paint p) {
        Paint.FontMetrics m = p.getFontMetrics();
        return m.descent - m.ascent;
    }

    void setListener(Listener l) {
        listener = l;
    }

    /** The big word and, under it, what Later puts off (the task's name). */
    void setWords(String word, String under) {
        label = word == null ? "" : word;
        sub = under == null ? "" : under.trim();
        setContentDescription(sub.isEmpty() ? label : label + ". " + sub);
        requestLayout();
        invalidate();
    }

    void setColors(int baseColor, int borderColor, int fillColor, int textColor) {
        base.setColor(baseColor);
        border.setColor(borderColor);
        fill.setColor(fillColor);
        labelPaint.setColor(textColor);
        subPaint.setColor(textColor);
        subPaint.setAlpha(Math.round(Color.alpha(textColor) * 0.9f));
        invalidate();
    }

    @Override
    protected void onMeasure(int widthSpec, int heightSpec) {
        float words = lineHeight(labelPaint) + (sub.isEmpty() ? 0f : dp(3f) + lineHeight(subPaint));
        int want = (int) Math.ceil(Math.max(dp(88f), words + dp(38f)));
        setMeasuredDimension(getDefaultSize(getSuggestedMinimumWidth(), widthSpec), resolveSize(want, heightSpec));
    }

    @Override
    protected void onDraw(Canvas c) {
        float w = getWidth();
        float h = getHeight();
        float inset = border.getStrokeWidth() / 2f;
        box.set(inset, inset, w - inset, h - inset);
        float r = Math.min(dp(30f), h / 2f);
        c.drawRoundRect(box, r, r, base);
        if (progress > 0f) {
            shape.rewind();
            shape.addRoundRect(box, r, r, Path.Direction.CW);
            int saved = c.save();
            c.clipPath(shape);
            c.drawRect(0f, 0f, w * progress, h, fill);
            c.restoreToCount(saved);
        }
        c.drawRoundRect(box, r, r, border);
        float labelH = lineHeight(labelPaint);
        float subH = sub.isEmpty() ? 0f : lineHeight(subPaint);
        float gap = sub.isEmpty() ? 0f : dp(3f);
        float top = (h - (labelH + gap + subH)) / 2f;
        float room = Math.max(0f, w - dp(36f));
        CharSequence l = TextUtils.ellipsize(label, labelPaint, room, TextUtils.TruncateAt.END);
        c.drawText(l, 0, l.length(), w / 2f, top - labelPaint.getFontMetrics().ascent, labelPaint);
        if (!sub.isEmpty()) {
            CharSequence s = TextUtils.ellipsize(sub, subPaint, room, TextUtils.TruncateAt.END);
            c.drawText(s, 0, s.length(), w / 2f, top + labelH + gap - subPaint.getFontMetrics().ascent, subPaint);
        }
    }

    @Override
    public boolean onTouchEvent(MotionEvent ev) {
        if (!isEnabled() || held) {
            return true;
        }
        switch (ev.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                down = true;
                downAt = SystemClock.uptimeMillis();
                if (getParent() != null) {
                    getParent().requestDisallowInterceptTouchEvent(true);
                }
                go(FILLING);
                return true;
            case MotionEvent.ACTION_MOVE:
                // A finger that slides off the bar has let go.
                float slop = dp(24f);
                if (down && (ev.getX() < -slop || ev.getX() > getWidth() + slop
                        || ev.getY() < -slop || ev.getY() > getHeight() + slop)) {
                    letGo(false);
                }
                return true;
            case MotionEvent.ACTION_UP:
                letGo(SystemClock.uptimeMillis() - downAt < TAP_MS);
                return true;
            case MotionEvent.ACTION_CANCEL:
                letGo(false);
                return true;
            default:
                return true;
        }
    }

    private void go(int next) {
        removeCallbacks(tick);
        mode = next;
        from = progress;
        modeAt = SystemClock.uptimeMillis();
        postOnAnimation(tick);
    }

    private void letGo(boolean tap) {
        if (!down) {
            return;
        }
        down = false;
        if (held) {
            return;
        }
        go(DRAINING);
        if (tap && listener != null) {
            listener.onTapped();
        }
    }

    private void finishHold() {
        if (held) {
            return;
        }
        held = true;
        down = false;
        progress = 1f;
        invalidate();
        try {
            performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
        } catch (Exception ignored) {
        }
        if (listener != null) {
            listener.onHeld();
        }
    }

    /** A screen reader's double tap, or a keyboard's Enter: counted as the hold. */
    @Override
    public boolean performClick() {
        super.performClick();
        removeCallbacks(tick);
        mode = IDLE;
        finishHold();
        return true;
    }

    @Override
    protected void onDetachedFromWindow() {
        removeCallbacks(tick);
        mode = IDLE;
        super.onDetachedFromWindow();
    }
}
