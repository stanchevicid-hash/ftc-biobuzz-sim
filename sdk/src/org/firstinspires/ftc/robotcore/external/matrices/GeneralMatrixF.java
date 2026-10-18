package org.firstinspires.ftc.robotcore.external.matrices;

public class GeneralMatrixF extends MatrixF {
    final float[] data;
    public GeneralMatrixF(int numRows, int numCols) { super(numRows, numCols); data = new float[numRows * numCols]; }
    public GeneralMatrixF(int numRows, int numCols, float[] data) { super(numRows, numCols); this.data = data.clone(); }
    public static GeneralMatrixF of(double[][] m) {
        GeneralMatrixF r = new GeneralMatrixF(m.length, m[0].length);
        for (int i = 0; i < m.length; i++) for (int j = 0; j < m[0].length; j++) r.put(i, j, (float) m[i][j]);
        return r;
    }
    @Override public float get(int row, int col) { return data[row * numCols + col]; }
    @Override public void put(int row, int col, float value) { data[row * numCols + col] = value; }
}
