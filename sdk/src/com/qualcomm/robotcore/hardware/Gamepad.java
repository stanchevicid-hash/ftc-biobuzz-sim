package com.qualcomm.robotcore.hardware;

import ftcsim.Json;
import java.util.ArrayList;
import java.util.Map;

/** Same public fields/methods as the SDK Gamepad. The simulator fills it from the browser Gamepad API / keyboard. */
public class Gamepad {
    public enum Type { UNKNOWN, LOGITECH_F310, XBOX_360, SONY_PS4, SONY_PS4_SUPPORTED_BY_KERNEL }
    public static final int ID_UNASSOCIATED = -1;
    public static final int ID_SYNTHETIC = -2;
    public static final float DEFAULT_TRIGGER_THRESHOLD = 0.5f;
    public static final int LED_DURATION_CONTINUOUS = -1;
    public static final int RUMBLE_DURATION_CONTINUOUS = -1;

    public volatile Type type = Type.UNKNOWN;
    public volatile float left_stick_x, left_stick_y, right_stick_x, right_stick_y;
    public volatile boolean dpad_up, dpad_down, dpad_left, dpad_right;
    public volatile boolean a, b, x, y, guide, start, back, left_bumper, right_bumper, left_stick_button, right_stick_button;
    public volatile float left_trigger, right_trigger;
    public volatile boolean left_trigger_pressed, right_trigger_pressed;
    public volatile boolean circle, cross, triangle, square, share, options, touchpad, ps;
    public volatile boolean touchpad_finger_1, touchpad_finger_2;
    public volatile float touchpad_finger_1_x, touchpad_finger_1_y, touchpad_finger_2_x, touchpad_finger_2_y;
    public volatile int id = ID_UNASSOCIATED;
    public volatile long timestamp;
    public long nextRumbleApproxFinishTime = -1L;
    private float triggerThreshold = DEFAULT_TRIGGER_THRESHOLD;

    private static final int N = 25;
    private final int[] pressCount = new int[N], releaseCount = new int[N];
    private final int[] seenPress = new int[N], seenRelease = new int[N];
    private final boolean[] last = new boolean[N];
    private volatile long rumbleUntilMs = 0;
    /** set by rumble()/setLedColor(), read by the bridge and shown in the browser */
    public volatile String simFeedback = null;

    public Gamepad() {}

    private boolean get(int i) {
        switch (i) {
            case 0: return dpad_up;
            case 1: return dpad_down;
            case 2: return dpad_left;
            case 3: return dpad_right;
            case 4: return a;
            case 5: return b;
            case 6: return x;
            case 7: return y;
            case 8: return guide;
            case 9: return start;
            case 10: return back;
            case 11: return left_bumper;
            case 12: return right_bumper;
            case 13: return left_stick_button;
            case 14: return right_stick_button;
            case 15: return circle;
            case 16: return cross;
            case 17: return triangle;
            case 18: return square;
            case 19: return share;
            case 20: return options;
            case 21: return touchpad;
            case 22: return ps;
            case 23: return left_trigger_pressed;
            case 24: return right_trigger_pressed;
            default: return false;
        }
    }

    /** Called by the simulator with {left_stick_x:..., a:true, ...} (sticks: SDK convention, up = negative y). */
    public synchronized void simUpdate(Map<String, Object> m) {
        if (m == null || m.isEmpty()) return;
        left_stick_x = (float) Json.num(m.get("left_stick_x"), 0);
        left_stick_y = (float) Json.num(m.get("left_stick_y"), 0);
        right_stick_x = (float) Json.num(m.get("right_stick_x"), 0);
        right_stick_y = (float) Json.num(m.get("right_stick_y"), 0);
        left_trigger = (float) Json.num(m.get("left_trigger"), 0);
        right_trigger = (float) Json.num(m.get("right_trigger"), 0);
        dpad_up = Json.bool(m.get("dpad_up"));
        dpad_down = Json.bool(m.get("dpad_down"));
        dpad_left = Json.bool(m.get("dpad_left"));
        dpad_right = Json.bool(m.get("dpad_right"));
        a = Json.bool(m.get("a"));
        b = Json.bool(m.get("b"));
        x = Json.bool(m.get("x"));
        y = Json.bool(m.get("y"));
        guide = Json.bool(m.get("guide"));
        start = Json.bool(m.get("start"));
        back = Json.bool(m.get("back"));
        left_bumper = Json.bool(m.get("left_bumper"));
        right_bumper = Json.bool(m.get("right_bumper"));
        left_stick_button = Json.bool(m.get("left_stick_button"));
        right_stick_button = Json.bool(m.get("right_stick_button"));
        circle = Json.bool(m.get("circle"));
        cross = Json.bool(m.get("cross"));
        triangle = Json.bool(m.get("triangle"));
        square = Json.bool(m.get("square"));
        share = Json.bool(m.get("share"));
        options = Json.bool(m.get("options"));
        touchpad = Json.bool(m.get("touchpad"));
        ps = Json.bool(m.get("ps"));
        updateButtonAliases();
        id = Json.bool(m.get("connected")) ? 1 : ID_UNASSOCIATED;
        timestamp = System.nanoTime();
        for (int i = 0; i < N; i++) {
            boolean v = get(i);
            if (v && !last[i]) pressCount[i]++;
            if (!v && last[i]) releaseCount[i]++;
            last[i] = v;
        }
    }

    private synchronized boolean edge(int i, boolean press) {
        if (press) { boolean r = pressCount[i] != seenPress[i]; seenPress[i] = pressCount[i]; return r; }
        boolean r = releaseCount[i] != seenRelease[i]; seenRelease[i] = releaseCount[i]; return r;
    }
    public synchronized void resetEdgeDetection() {
        System.arraycopy(pressCount, 0, seenPress, 0, N); System.arraycopy(releaseCount, 0, seenRelease, 0, N);
    }

    protected void updateButtonAliases() {
        // PlayStation names mirror the Xbox/Logitech ones in both directions
        boolean ca = a || cross, cb = b || circle, cx = x || square, cy = y || triangle;
        a = cross = ca; b = circle = cb; x = square = cx; y = triangle = cy;
        boolean st = start || options, bk = back || share, gd = guide || ps;
        start = options = st; back = share = bk; guide = ps = gd;
        left_trigger_pressed = left_trigger > triggerThreshold;
        right_trigger_pressed = right_trigger > triggerThreshold;
    }

    public void setTriggerThreshold(float threshold) { triggerThreshold = threshold; }
    public float getTriggerThreshold() { return triggerThreshold; }
    public void setGamepadId(int id) { this.id = id; }
    public int getGamepadId() { return id; }
    public void setTimestamp(long t) { timestamp = t; }
    public void refreshTimestamp() { timestamp = System.nanoTime(); }

    public void copy(Gamepad g) {
        left_stick_x = g.left_stick_x; left_stick_y = g.left_stick_y; right_stick_x = g.right_stick_x; right_stick_y = g.right_stick_y;
        dpad_up = g.dpad_up; dpad_down = g.dpad_down; dpad_left = g.dpad_left; dpad_right = g.dpad_right;
        a = g.a; b = g.b; x = g.x; y = g.y; guide = g.guide; start = g.start; back = g.back;
        left_bumper = g.left_bumper; right_bumper = g.right_bumper; left_stick_button = g.left_stick_button; right_stick_button = g.right_stick_button;
        left_trigger = g.left_trigger; right_trigger = g.right_trigger; left_trigger_pressed = g.left_trigger_pressed; right_trigger_pressed = g.right_trigger_pressed;
        circle = g.circle; cross = g.cross; triangle = g.triangle; square = g.square; share = g.share; options = g.options; touchpad = g.touchpad; ps = g.ps;
        id = g.id; timestamp = g.timestamp; type = g.type;
    }
    public void reset() { copy(new Gamepad()); }
    public boolean atRest() {
        return left_stick_x == 0 && left_stick_y == 0 && right_stick_x == 0 && right_stick_y == 0 && left_trigger == 0 && right_trigger == 0;
    }
    public Type type() { return type; }

    public void setLedColor(double r, double g, double b, int durationMs) { simFeedback = String.format("led %.2f %.2f %.2f %d", r, g, b, durationMs); }
    public void runLedEffect(LedEffect effect) { simFeedback = "led effect"; }
    public void runRumbleEffect(RumbleEffect effect) { rumble(500); }
    public void rumble(int durationMs) { rumble(1, 1, durationMs); }
    public void rumble(double rumble1, double rumble2, int durationMs) {
        rumbleUntilMs = System.currentTimeMillis() + (durationMs < 0 ? 3600000 : durationMs);
        simFeedback = String.format("rumble %.2f %.2f %d", rumble1, rumble2, durationMs);
    }
    public void stopRumble() { rumbleUntilMs = 0; simFeedback = "rumble 0 0 0"; }
    public void rumbleBlips(int count) { rumble(1, 1, 150 * count); }
    public boolean isRumbling() { return System.currentTimeMillis() < rumbleUntilMs; }

    public boolean dpadUpWasPressed() { return edge(0, true); }
    public boolean dpadUpWasReleased() { return edge(0, false); }
    public boolean dpadDownWasPressed() { return edge(1, true); }
    public boolean dpadDownWasReleased() { return edge(1, false); }
    public boolean dpadLeftWasPressed() { return edge(2, true); }
    public boolean dpadLeftWasReleased() { return edge(2, false); }
    public boolean dpadRightWasPressed() { return edge(3, true); }
    public boolean dpadRightWasReleased() { return edge(3, false); }
    public boolean aWasPressed() { return edge(4, true); }
    public boolean aWasReleased() { return edge(4, false); }
    public boolean bWasPressed() { return edge(5, true); }
    public boolean bWasReleased() { return edge(5, false); }
    public boolean xWasPressed() { return edge(6, true); }
    public boolean xWasReleased() { return edge(6, false); }
    public boolean yWasPressed() { return edge(7, true); }
    public boolean yWasReleased() { return edge(7, false); }
    public boolean guideWasPressed() { return edge(8, true); }
    public boolean guideWasReleased() { return edge(8, false); }
    public boolean startWasPressed() { return edge(9, true); }
    public boolean startWasReleased() { return edge(9, false); }
    public boolean backWasPressed() { return edge(10, true); }
    public boolean backWasReleased() { return edge(10, false); }
    public boolean leftBumperWasPressed() { return edge(11, true); }
    public boolean leftBumperWasReleased() { return edge(11, false); }
    public boolean rightBumperWasPressed() { return edge(12, true); }
    public boolean rightBumperWasReleased() { return edge(12, false); }
    public boolean leftStickButtonWasPressed() { return edge(13, true); }
    public boolean leftStickButtonWasReleased() { return edge(13, false); }
    public boolean rightStickButtonWasPressed() { return edge(14, true); }
    public boolean rightStickButtonWasReleased() { return edge(14, false); }
    public boolean circleWasPressed() { return edge(15, true); }
    public boolean circleWasReleased() { return edge(15, false); }
    public boolean crossWasPressed() { return edge(16, true); }
    public boolean crossWasReleased() { return edge(16, false); }
    public boolean triangleWasPressed() { return edge(17, true); }
    public boolean triangleWasReleased() { return edge(17, false); }
    public boolean squareWasPressed() { return edge(18, true); }
    public boolean squareWasReleased() { return edge(18, false); }
    public boolean shareWasPressed() { return edge(19, true); }
    public boolean shareWasReleased() { return edge(19, false); }
    public boolean optionsWasPressed() { return edge(20, true); }
    public boolean optionsWasReleased() { return edge(20, false); }
    public boolean touchpadWasPressed() { return edge(21, true); }
    public boolean touchpadWasReleased() { return edge(21, false); }
    public boolean psWasPressed() { return edge(22, true); }
    public boolean psWasReleased() { return edge(22, false); }
    public boolean leftTriggerWasPressed() { return edge(23, true); }
    public boolean leftTriggerWasReleased() { return edge(23, false); }
    public boolean rightTriggerWasPressed() { return edge(24, true); }
    public boolean rightTriggerWasReleased() { return edge(24, false); }

    @Override public String toString() {
        return String.format("ID: %d user: - lx: %.2f ly: %.2f rx: %.2f ry: %.2f lt: %.2f rt: %.2f %s%s%s%s",
                id, left_stick_x, left_stick_y, right_stick_x, right_stick_y, left_trigger, right_trigger,
                a ? "a " : "", b ? "b " : "", x ? "x " : "", y ? "y " : "");
    }

    public static class LedEffect {
        public final ArrayList<Step> steps; public final boolean repeating; public int user;
        LedEffect(ArrayList<Step> steps, boolean repeating) { this.steps = steps; this.repeating = repeating; }
        public String serialize() { return "led"; }
        public static LedEffect deserialize(String s) { return new LedEffect(new ArrayList<Step>(), false); }
        public static class Builder {
            private final ArrayList<Step> steps = new ArrayList<Step>(); private boolean repeating;
            public Builder addStep(double r, double g, double b, int durationMs) { Step s = new Step(); s.r = (int) (r * 255); s.g = (int) (g * 255); s.b = (int) (b * 255); s.duration = durationMs; steps.add(s); return this; }
            public Builder setRepeating(boolean repeating) { this.repeating = repeating; return this; }
            public LedEffect build() { return new LedEffect(steps, repeating); }
        }
        public static class Step { public int r, g, b, duration; }
    }
    public static class RumbleEffect {
        public int user; public final ArrayList<Step> steps;
        RumbleEffect(ArrayList<Step> steps) { this.steps = steps; }
        public String serialize() { return "rumble"; }
        public static RumbleEffect deserialize(String s) { return new RumbleEffect(new ArrayList<Step>()); }
        public static class Builder {
            private final ArrayList<Step> steps = new ArrayList<Step>();
            public Builder addStep(double rumble1, double rumble2, int durationMs) { Step s = new Step(); s.large = (int) (rumble1 * 255); s.small = (int) (rumble2 * 255); s.duration = durationMs; steps.add(s); return this; }
            public RumbleEffect build() { return new RumbleEffect(steps); }
        }
        public static class Step { public int large, small, duration; }
    }
}
