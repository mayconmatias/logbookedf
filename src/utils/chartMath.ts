import * as d3 from 'd3-shape'; // Assumindo que você tem d3 ou d3-shape instalado

// Regressão Linear Simples (Mínimos Quadrados)
export const calculateTrendLine = (data: { x: number; y: number }[]) => {
  if (data.length < 2) return null;

  const n = data.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

  for (let i = 0; i < n; i++) {
    sumX += data[i].x;
    sumY += data[i].y;
    sumXY += (data[i].x * data[i].y);
    sumXX += (data[i].x * data[i].x);
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Retorna os pontos inicial e final da linha de tendência
  return {
    start: { x: data[0].x, y: slope * data[0].x + intercept },
    end: { x: data[n - 1].x, y: slope * data[n - 1].x + intercept },
    slopeValue: slope // Positivo = Crescendo, Negativo = Caindo
  };
};

// Gera o Path Curvo (Suavizado)
export const generateCurvedPath = (points: { x: number; y: number }[]) => {
  const lineGenerator = d3.line<{ x: number; y: number }>()
    .x(d => d.x)
    .y(d => d.y)
    .curve(d3.curveCatmullRom.alpha(0.5)); // Curva suave e orgânica

  return lineGenerator(points) || '';
};