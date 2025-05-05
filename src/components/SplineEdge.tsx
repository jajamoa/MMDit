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
  data,
  label,
}: EdgeProps) {
  // Debug: log received props
  console.log(`SplineEdge ${id} received:`, { 
    style, 
    markerEnd,
    data
  });

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
  
  // Determine if this is a negative edge (check both style and data)
  const isNegative = data?.isNegative === true || 
                     style?.strokeDasharray === '5,5' || 
                     (style?.stroke === '#cc0000');
  
  // If edge is negative but style doesn't reflect it, override style
  const edgeStyle = {
    ...style,
    // If isNegative is true in data but not reflected in style, apply negative styling
    stroke: isNegative && !style?.stroke ? '#cc0000' : style?.stroke,
    strokeDasharray: isNegative && !style?.strokeDasharray ? '5,5' : style?.strokeDasharray,
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={path || ''}
        style={edgeStyle}
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