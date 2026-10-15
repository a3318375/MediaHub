import { useState } from "react";
import { salesData, trafficOrganic, trafficPaid, monthLabels } from "./data";

export function SalesChart({ factor = 1 }: { factor?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 520,
    height = 216,
    left = 32,
    right = 12,
    top = 14,
    bottom = 32;
  const plotWidth = width - left - right,
    plotHeight = height - top - bottom;
  return (
    <div className="chart-plot">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Monthly sales bar chart, January to December"
      >
        {[0, 20, 40, 60].map((value) => (
          <g key={value}>
            <line
              x1={left}
              x2={width - right}
              y1={top + plotHeight - (value / 60) * plotHeight}
              y2={top + plotHeight - (value / 60) * plotHeight}
              className="chart-gridline"
            />
            <text
              x={left - 9}
              y={top + plotHeight - (value / 60) * plotHeight + 4}
              textAnchor="end"
              className="chart-label"
            >
              {value}
            </text>
          </g>
        ))}
        {salesData.map((value, i) => {
          const actual = Math.min(59, Math.round(value * factor));
          const x = left + (i * plotWidth) / 12 + 10,
            y = top + plotHeight - (actual / 60) * plotHeight;
          return (
            <g
              key={i}
              tabIndex={0}
              role="graphics-symbol"
              aria-label={`${monthLabels[i]}: ${actual} sales`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            >
              <rect
                x={x - 5}
                y={top}
                width={plotWidth / 12}
                height={plotHeight}
                fill="transparent"
              />
              <rect
                x={x}
                y={y}
                width={19}
                height={(actual / 60) * plotHeight}
                rx={9.5}
                fill="var(--chart-blue)"
                opacity={hover === null || hover === i ? 1 : 0.48}
              />
              <text
                x={x + 9.5}
                y={height - 9}
                textAnchor="middle"
                className="chart-label"
              >
                {String(i + 1).padStart(2, "0")}
              </text>
              {hover === i && (
                <g>
                  <rect
                    x={Math.max(0, x - 23)}
                    y={Math.max(0, y - 29)}
                    width={64}
                    height={23}
                    rx={6}
                    fill="var(--foreground)"
                  />
                  <text
                    x={Math.max(0, x - 23) + 32}
                    y={Math.max(0, y - 29) + 15}
                    fill="var(--surface)"
                    textAnchor="middle"
                    fontSize={11}
                  >
                    {actual} sales
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function TrafficChart({ factor = 1 }: { factor?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 520,
    height = 232,
    left = 36,
    right = 10,
    top = 12,
    bottom = 32,
    plotWidth = width - left - right,
    plotHeight = height - top - bottom;
  const point = (value: number, i: number) => [
    left + (i * plotWidth) / 11,
    top + plotHeight - (Math.min(24000, value * factor) / 24000) * plotHeight,
  ];
  const path = (values: number[]) =>
    values
      .map((v, i) => {
        const [x, y] = point(v, i);
        return `${i ? "L" : "M"}${x},${y}`;
      })
      .join(" ");
  return (
    <div className="chart-plot traffic-plot">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Organic and paid traffic, January to December"
      >
        {[0, 5000, 10000, 20000].map((value) => (
          <g key={value}>
            <line
              x1={left}
              x2={width - right}
              y1={top + plotHeight - (value / 24000) * plotHeight}
              y2={top + plotHeight - (value / 24000) * plotHeight}
              className="chart-gridline"
            />
            <text
              x={left - 9}
              y={top + plotHeight - (value / 24000) * plotHeight + 4}
              textAnchor="end"
              className="chart-label"
            >
              {value ? `${value / 1000}k` : "0"}
            </text>
          </g>
        ))}
        <path
          d={path(trafficOrganic)}
          fill="none"
          stroke="#147acf"
          strokeWidth={2}
        />
        <path
          d={path(trafficPaid)}
          fill="none"
          stroke="#47a9e9"
          strokeWidth={2}
        />
        {monthLabels.map((month, i) => (
          <g
            key={month}
            tabIndex={0}
            role="graphics-symbol"
            aria-label={`${month}: ${Math.round(trafficOrganic[i] * factor)} organic, ${Math.round(trafficPaid[i] * factor)} paid sessions`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
          >
            <rect
              x={left + (i * plotWidth) / 11 - plotWidth / 22}
              y={top}
              width={plotWidth / 11}
              height={plotHeight}
              fill="transparent"
            />
            <text
              x={left + (i * plotWidth) / 11}
              y={height - 9}
              textAnchor="middle"
              className="chart-label"
            >
              {month}
            </text>
          </g>
        ))}
        {hover !== null && (
          <g>
            <line
              x1={point(0, hover)[0]}
              x2={point(0, hover)[0]}
              y1={top}
              y2={top + plotHeight}
              stroke="var(--muted)"
              strokeDasharray="3 4"
            />
            {[trafficOrganic, trafficPaid].map((values, index) => (
              <circle
                key={index}
                cx={point(values[hover], hover)[0]}
                cy={point(values[hover], hover)[1]}
                r={4}
                fill={index ? "#47a9e9" : "#147acf"}
                stroke="var(--surface)"
                strokeWidth={2}
              />
            ))}
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="traffic-tooltip">
          {monthLabels[hover]} ·{" "}
          {Math.round(
            (trafficOrganic[hover] + trafficPaid[hover]) * factor,
          ).toLocaleString()}{" "}
          sessions
        </div>
      )}
    </div>
  );
}
