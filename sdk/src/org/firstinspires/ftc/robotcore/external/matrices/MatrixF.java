package org.firstinspires.ftc.robotcore.external.matrices;

public abstract class MatrixF {
    protected int numRows, numCols;
    protected MatrixF(int numRows, int numCols) { this.numRows = numRows; this.numCols = numCols; }
    public int numRows() { return numRows; }
    public int numCols() { return numCols; }
    public abstract float get(int row, int col);
    public abstract void put(int row, int col, float value);
    public MatrixF multiplied(MatrixF him) {
        GeneralMatrixF r = new GeneralMatrixF(numRows, him.numCols);
        for (int i = 0; i < numRows; i++) for (int j = 0; j < him.numCols; j++) { float s = 0; for (int k = 0; k < numCols; k++) s += get(i, k) * him.get(k, j); r.put(i, j, s); }
        return r;
    }
    public MatrixF transposed() {
        GeneralMatrixF r = new GeneralMatrixF(numCols, numRows);
        for (int i = 0; i < numRows; i++) for (int j = 0; j < numCols; j++) r.put(j, i, get(i, j));
        return r;
    }
    @Override public String toString() {
        StringBuilder b = new StringBuilder("{");
        for (int i = 0; i < numRows; i++) { if (i > 0) b.append(", "); b.append('{'); for (int j = 0; j < numCols; j++) { if (j > 0) b.append(' '); b.append(String.format("%.3f", get(i, j))); } b.append('}'); }
        return b.append('}').toString();
    }
}
