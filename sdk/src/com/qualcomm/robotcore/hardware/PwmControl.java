package com.qualcomm.robotcore.hardware;

public interface PwmControl {
    void setPwmRange(PwmRange range);
    PwmRange getPwmRange();
    void setPwmEnable();
    void setPwmDisable();
    boolean isPwmEnabled();
    void setPulseWidth(double usPulse);
    double getPulseWidth();

    class PwmRange {
        public static final double usFrameDefault = 20000.0;
        public static final double usPulseUpperDefault = 2400.0;
        public static final double usPulseLowerDefault = 600.0;
        public static final PwmRange defaultRange = new PwmRange(600.0, 2400.0);
        public final double usPulseLower, usPulseUpper, usFrame;
        public PwmRange(double usPulseLower, double usPulseUpper) { this(usPulseLower, usPulseUpper, usFrameDefault); }
        public PwmRange(double usPulseLower, double usPulseUpper, double usFrame) {
            this.usPulseLower = usPulseLower; this.usPulseUpper = usPulseUpper; this.usFrame = usFrame;
        }
        @Override public boolean equals(Object o) {
            if (!(o instanceof PwmRange)) return false;
            PwmRange r = (PwmRange) o;
            return r.usPulseLower == usPulseLower && r.usPulseUpper == usPulseUpper && r.usFrame == usFrame;
        }
        @Override public int hashCode() { return Double.valueOf(usPulseLower + 3 * usPulseUpper + 7 * usFrame).hashCode(); }
    }
}
