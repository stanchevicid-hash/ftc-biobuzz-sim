package com.qualcomm.robotcore.hardware;

public class PIDFCoefficients {
    public double p, i, d, f;
    public MotorControlAlgorithm algorithm = MotorControlAlgorithm.PIDF;
    public PIDFCoefficients() {}
    public PIDFCoefficients(double p, double i, double d, double f, MotorControlAlgorithm algorithm) { this(p, i, d, f); this.algorithm = algorithm; }
    public PIDFCoefficients(double p, double i, double d, double f) { this.p = p; this.i = i; this.d = d; this.f = f; }
    public PIDFCoefficients(PIDFCoefficients them) { this(them.p, them.i, them.d, them.f, them.algorithm); }
    public PIDFCoefficients(PIDCoefficients them) { this(them.p, them.i, them.d, 0); }
    @Override public String toString() { return String.format("p=%f i=%f d=%f f=%f alg=%s", p, i, d, f, algorithm); }
}
