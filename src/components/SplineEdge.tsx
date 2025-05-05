import React from 'react';
import { BaseEdge, EdgeLabelRenderer, EdgeProps } from 'reactflow';
import { curveBasis, line } from 'd3-shape';

export default function SplineEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  label,
}: EdgeProps) {
  // Calculate vertical offset - half the vertical distance
  const offset = (targetY - sourceY) / 2;
  
  // Generate bezier control points
  // First control point: same x as source, y at midpoint
  // Second control point: same x as target, y at midpoint
  const points = [
    [sourceX, sourceY],
    [sourceX, sourceY + offset], // Control point 1
    [targetX, targetY - offset], // Control point 2
    [targetX, targetY]
  ];

  // Use curveBasis for smoother interpolation
  const pathGenerator = line().curve(curveBasis);
  const path = pathGenerator(points as [number, number][]);

  // Calculate label position
  const labelX = (sourceX + targetX) / 2;
  const labelY = (sourceY + targetY) / 2;

  return (
    <>
      <BaseEdge
        id={id}
        path={path || ''}
        style={{
          ...style,
        }}
        markerEnd={markerEnd}
      />
      
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%)`,
              left: labelX,
              top: labelY,
              background: 'white',
              padding: '2px 4px',
              borderRadius: '2px',
              fontSize: 12,
              fontFamily: 'sans-serif',
              pointerEvents: 'all',
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
} 