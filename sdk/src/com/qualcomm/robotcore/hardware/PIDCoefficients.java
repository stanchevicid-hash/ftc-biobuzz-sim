package com.qualcomm.robotcore.hardware;

public class PIDCoefficients {
    public double p, i, d;
    public PIDCoefficients() {}
    public PIDCoefficients(double p, double i, double d) { this.p = p; this.i = i; this.d = d; }
    @Override public String toString() { return String.format("p=%f i=%f d=%f", p, i, d); }
}
