package com.qualcomm.robotcore.hardware;

import com.qualcomm.robotcore.hardware.configuration.typecontainers.MotorConfigurationType;
import ftcsim.Sim;
import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.CurrentUnit;

public class DcMotorImplEx extends DcMotorImpl implements DcMotorEx {
    protected double currentAlert = 8.0;

    public DcMotorImplEx(String name, int port, MotorConfigurationType type) { super(name, port, type); }

    @Override public void setMotorEnable() { enabled = true; }
    @Override public void setMotorDisable() { enabled = false; }
    @Override public boolean isMotorEnabled() { return enabled; }
    @Override public void setVelocity(double angularRate) { velocityTarget = angularRate; }
    @Override public void setVelocity(double angularRate, AngleUnit unit) {
        double revPerSec = unit.toRadians(angularRate) / (2 * Math.PI);
        velocityTarget = revPerSec * motorType.getTicksPerRev();
    }
    @Override public double getVelocity() { return sign() * rawVel(); }
    @Override public double getVelocity(AngleUnit unit) {
        double radPerSec = getVelocity() / motorType.getTicksPerRev() * 2 * Math.PI;
        return unit.fromRadians(radPerSec);
    }
    @Override @Deprecated public void setPIDCoefficients(RunMode mode, PIDCoefficients c) { setPIDFCoefficients(mode, new PIDFCoefficients(c)); }
    @Override public void setPIDFCoefficients(RunMode mode, PIDFCoefficients c) {
        if (mode == RunMode.RUN_USING_ENCODER) velPidf = new PIDFCoefficients(c);
        else if (mode == RunMode.RUN_TO_POSITION) posPidf = new PIDFCoefficients(c);
        else throw new UnsupportedOperationException("setPIDFCoefficients: unsupported mode " + mode);
    }
    @Override public void setVelocityPIDFCoefficients(double p, double i, double d, double f) { velPidf = new PIDFCoefficients(p, i, d, f); }
    @Override public void setPositionPIDFCoefficients(double p) { posPidf = new PIDFCoefficients(p, 0, 0, 0); }
    @Override @Deprecated public PIDCoefficients getPIDCoefficients(RunMode mode) { PIDFCoefficients c = getPIDFCoefficients(mode); return new PIDCoefficients(c.p, c.i, c.d); }
    @Override public PIDFCoefficients getPIDFCoefficients(RunMode mode) { return new PIDFCoefficients(mode == RunMode.RUN_TO_POSITION ? posPidf : velPidf); }
    @Override public void setTargetPositionTolerance(int t) { tolerance = t; }
    @Override public int getTargetPositionTolerance() { return tolerance; }
    @Override public double getCurrent(CurrentUnit unit) { return unit.convert(Math.abs(Sim.num("motors", name, "cur", 0)), CurrentUnit.AMPS); }
    @Override public double getCurrentAlert(CurrentUnit unit) { return unit.convert(currentAlert, CurrentUnit.AMPS); }
    @Override public void setCurrentAlert(double current, CurrentUnit unit) { currentAlert = CurrentUnit.AMPS.convert(current, unit); }
    @Override public boolean isOverCurrent() { return getCurrent(CurrentUnit.AMPS) > currentAlert; }
}
