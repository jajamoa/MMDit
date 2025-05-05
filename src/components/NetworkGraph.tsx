import React, { useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Panel,
  ConnectionMode,
  MarkerType,
  getBezierPath,
  EdgeProps,
  ConnectionLineType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import SplineEdge from './SplineEdge';

// Add type definition with support for className
interface CustomNodeData {
  label: string;
  width?: number;
  className?: string;
}

// Define common style mappings
const CLASS_STYLES: Record<string, React.CSSProperties> = {
  stanceNode: {
    background: '#f9f', // Pink fill
    border: '2px solid #333',
    minWidth: '180px',
  },
  factorNode: {
    background: '#bbf', // Light blue fill
    border: '1px solid #333',
    minWidth: '200px',
    maxWidth: '400px',
    whiteSpace: 'pre-wrap' as const,
  },
  title: {
    background: 'none',
    border: 'none',
    fontWeight: 'bold',
    fontSize: '16px',
    padding: '5px 10px',
  }
};

interface NetworkGraphProps {
  nodes: Node[];
  edges: Edge[];
  layout?: 'default' | 'force' | 'tree';
}

// Improved tree layout algorithm for causal networks
const applyTreeLayout = (nodes: Node[], edges: Edge[]): Node[] => {
  if (nodes.length === 0) return [];
  
  // Create deep copies of nodes to avoid mutating the original
  const nodesCopy = nodes.map(node => ({
    ...node,
    position: { ...node.position },
  }));

  // Build node lookup map
  const nodeMap = new Map<string, Node>();
  nodesCopy.forEach(node => nodeMap.set(node.id, node));
  
  // Build adjacency list for the graph
  const adjacencyList = new Map<string, Set<string>>();
  const reverseAdjacencyList = new Map<string, Set<string>>();
  
  edges.forEach(edge => {
    if (!adjacencyList.has(edge.source)) {
      adjacencyList.set(edge.source, new Set());
    }
    if (!adjacencyList.has(edge.target)) {
      adjacencyList.set(edge.target, new Set());
    }
    if (!reverseAdjacencyList.has(edge.target)) {
      reverseAdjacencyList.set(edge.target, new Set());
    }
    if (!reverseAdjacencyList.has(edge.source)) {
      reverseAdjacencyList.set(edge.source, new Set());
    }
    
    // Add connections (source to target)
    adjacencyList.get(edge.source)?.add(edge.target);
    // Track reverse connections (target to source) for finding leaf nodes
    reverseAdjacencyList.get(edge.target)?.add(edge.source);
  });
  
  // Find leaf nodes (nodes with out-degree = 0)
  const leafNodes = nodesCopy
    .filter(node => !adjacencyList.has(node.id) || adjacencyList.get(node.id)?.size === 0)
    .map(node => node.id);
  
  // Find root nodes (nodes with in-degree = 0)
  const rootNodes = nodesCopy
    .filter(node => !reverseAdjacencyList.has(node.id) || reverseAdjacencyList.get(node.id)?.size === 0)
    .map(node => node.id);
  
  console.log("Leaf nodes:", leafNodes);
  console.log("Root nodes:", rootNodes);
  
  // Force leaf nodes (out-degree = 0) to be at the bottom level
  // We'll use a bottom-up level assignment approach
  const visited = new Set<string>();
  const levels = new Map<string, number>();
  const levelNodes = new Map<number, string[]>();
  
  // Start by assigning the leaf nodes to the maximum level
  const maxLevel = 1000; // Initialize with a high number, will be adjusted later
  
  // First, assign leaf nodes to the max level
  leafNodes.forEach(nodeId => {
    levels.set(nodeId, maxLevel);
    if (!levelNodes.has(maxLevel)) {
      levelNodes.set(maxLevel, []);
    }
    levelNodes.get(maxLevel)?.push(nodeId);
    visited.add(nodeId);
  });
  
  // Then perform a bottom-up traversal, assigning levels to other nodes
  const assignLevelsBottomUp = (nodeId: string, level: number) => {
    // Process a node only if:
    // 1. It hasn't been visited yet, OR
    // 2. We can assign it a lower level (closer to top)
    if (!visited.has(nodeId) || (levels.get(nodeId) || 0) > level) {
      // If it was already assigned to a different level, remove it from there
      if (visited.has(nodeId)) {
        const prevLevel = levels.get(nodeId) || 0;
        const prevLevelNodes = levelNodes.get(prevLevel) || [];
        levelNodes.set(prevLevel, prevLevelNodes.filter(id => id !== nodeId));
      }
      
      // Assign to new level
      visited.add(nodeId);
      levels.set(nodeId, level);
      
      if (!levelNodes.has(level)) {
        levelNodes.set(level, []);
      }
      levelNodes.get(level)?.push(nodeId);
      
      // Process parents (bottom-up)
      const parents = reverseAdjacencyList.get(nodeId);
      if (parents) {
        Array.from(parents).forEach(parentId => {
          assignLevelsBottomUp(parentId, level - 1);
        });
      }
    }
  };
  
  // Start bottom-up traversal from leaf nodes
  leafNodes.forEach(nodeId => {
    const parents = reverseAdjacencyList.get(nodeId);
    if (parents) {
      Array.from(parents).forEach(parentId => {
        assignLevelsBottomUp(parentId, maxLevel - 1);
      });
    }
  });
  
  // Handle disconnected nodes and root nodes that might not have been visited
  nodesCopy.forEach(node => {
    if (!visited.has(node.id)) {
      // If it's a root node, assign it to level 0
      if (rootNodes.includes(node.id)) {
        visited.add(node.id);
        levels.set(node.id, 0);
        if (!levelNodes.has(0)) {
          levelNodes.set(0, []);
        }
        levelNodes.get(0)?.push(node.id);
      } else {
        // For truly disconnected nodes, assign to a middle level
        const midLevel = Math.floor(maxLevel / 2);
        visited.add(node.id);
        levels.set(node.id, midLevel);
        if (!levelNodes.has(midLevel)) {
          levelNodes.set(midLevel, []);
        }
        levelNodes.get(midLevel)?.push(node.id);
      }
    }
  });
  
  // Normalize levels (compress the level numbers to be consecutive starting from 0)
  const usedLevels = Array.from(levelNodes.keys()).sort((a, b) => a - b);
  const normalizedLevels = new Map<number, number>();
  
  usedLevels.forEach((level, index) => {
    normalizedLevels.set(level, index);
  });
  
  // Create new level assignments with normalized level numbers
  const normalizedLevelNodes = new Map<number, string[]>();
  
  levelNodes.forEach((nodeIds, level) => {
    const normalizedLevel = normalizedLevels.get(level) || 0;
    
    if (!normalizedLevelNodes.has(normalizedLevel)) {
      normalizedLevelNodes.set(normalizedLevel, []);
    }
    
    normalizedLevelNodes.get(normalizedLevel)?.push(...nodeIds);
    
    // Update levels map for each node
    nodeIds.forEach(nodeId => {
      levels.set(nodeId, normalizedLevel);
    });
  });
  
  // Use normalized level nodes from now on
  const finalLevelNodes = normalizedLevelNodes;
  
  // Calculate positions for each node by level
  const levelCount = finalLevelNodes.size;
  const verticalSpacing = 120; // Vertical spacing between levels
  const centerX = 600; // Center X position for the entire layout
  const startY = 120; // Start from top (roots)
  
  // Find central alignment axis based on middle nodes of odd-numbered rows
  // This will be our vertical alignment reference
  let centralAxis = centerX;
  const estimateNodeWidth = (nodeId: string): number => {
    const node = nodeMap.get(nodeId);
    if (!node) return 180; // Default width estimate
    
    // Get node label to estimate width
    const nodeData = node.data as CustomNodeData;
    const label = nodeData.label || '';
    
    // Handle multiline labels by finding the longest line
    let maxLineLength = 0;
    if (label.includes('\n')) {
      const lines = label.split('\n');
      for (const line of lines) {
        maxLineLength = Math.max(maxLineLength, line.length);
      }
    } else {
      maxLineLength = label.length;
    }
    
    // Special case for certain node types that may need more space
    const className = nodeData.className;
    
    // Calculate width based on label length and node type
    // Character width multiplier varies by font, around 8px per character is reasonable
    let estimatedWidth = Math.max(180, maxLineLength * 8.5);
    
    // Add additional padding for certain classes
    if (className && CLASS_STYLES[className]) {
      if (className === 'factorNode') {
        estimatedWidth = Math.max(estimatedWidth, 200); // Minimum width for factor nodes
      } else if (className === 'stanceNode') {
        estimatedWidth = Math.max(estimatedWidth, 180); // Minimum width for stance nodes
      }
    }
    
    // Add padding for margins and borders
    estimatedWidth += 32; // 16px padding on each side
    
    return estimatedWidth;
  };
  
  // First pass: determine central alignment axis from odd rows
  for (let level = 0; level < levelCount; level++) {
    const nodesInLevel = finalLevelNodes.get(level) || [];
    
    // Only process odd-numbered rows with at least one node for central alignment
    if (nodesInLevel.length % 2 === 1 && nodesInLevel.length > 0) {
      // Find the middle node in this odd-numbered row
      const middleIndex = Math.floor(nodesInLevel.length / 2);
      const middleNodeId = nodesInLevel[middleIndex];
      
      // We've found a middle node to use as reference for central alignment
      // We can break as we only need one reference point
      centralAxis = centerX;
      break;
    }
  }
  
  // Position nodes level by level (top to bottom)
  for (let level = 0; level < levelCount; level++) {
    const nodesInLevel = finalLevelNodes.get(level) || [];
    
    // Sort nodes within each level to minimize edge crossings
    // This is a simple heuristic - position nodes closer to their connections
    nodesInLevel.sort((a, b) => {
      const aConnectionsSet = adjacencyList.get(a) || new Set();
      const aReverseConnectionsSet = reverseAdjacencyList.get(a) || new Set();
      const bConnectionsSet = adjacencyList.get(b) || new Set(); 
      const bReverseConnectionsSet = reverseAdjacencyList.get(b) || new Set();
      
      const aConnections = Array.from(aConnectionsSet).concat(Array.from(aReverseConnectionsSet));
      const bConnections = Array.from(bConnectionsSet).concat(Array.from(bReverseConnectionsSet));
      
      // More connections should generally be placed more centrally
      return bConnections.length - aConnections.length;
    });
    
    // Increase horizontal spacing between nodes
    // Use a more generous spacing calculation based on the number of nodes
    // Minimum spacing increases to prevent crowding
    const baseSpacing = 220; // Minimum base spacing between node centers
    const adaptiveSpacing = Math.max(
      baseSpacing, 
      1200 / (nodesInLevel.length || 1), // More space for fewer nodes
    );
    
    // Calculate positions accounting for node widths for center alignment
    let positions: Array<{id: string, centerX: number, width: number}> = [];
    
    // Special alignment for odd-numbered rows
    if (nodesInLevel.length % 2 === 1) {
      // Odd number of nodes - middle node will be at central axis
      const middleIndex = Math.floor(nodesInLevel.length / 2);
      
      // Process each node from middle outward
      for (let i = 0; i < nodesInLevel.length; i++) {
        const nodeId = nodesInLevel[i];
        const nodeWidth = estimateNodeWidth(nodeId);
        
        let nodeCenterX = 0;
        
        if (i === middleIndex) {
          // Center middle node exactly on central axis
          nodeCenterX = centralAxis;
        } else if (i < middleIndex) {
          // Nodes to the left of middle
          const distanceFromMiddle = middleIndex - i;
          nodeCenterX = centralAxis - (distanceFromMiddle * adaptiveSpacing);
        } else {
          // Nodes to the right of middle
          const distanceFromMiddle = i - middleIndex;
          nodeCenterX = centralAxis + (distanceFromMiddle * adaptiveSpacing);
        }
        
        positions.push({id: nodeId, centerX: nodeCenterX, width: nodeWidth});
      }
    } else if (nodesInLevel.length > 0) {
      // Even number of nodes - space evenly around central axis
      const halfCount = nodesInLevel.length / 2;
      
      // Process each node from middle outward
      for (let i = 0; i < nodesInLevel.length; i++) {
        const nodeId = nodesInLevel[i];
        const nodeWidth = estimateNodeWidth(nodeId);
        
        // For even rows, space nodes evenly on both sides of central axis
        // leaving a gap in the middle
        let nodeCenterX = 0;
        
        if (i < halfCount) {
          // Nodes on the left side
          const distanceFromCenter = halfCount - i - 0.5;
          nodeCenterX = centralAxis - (distanceFromCenter * adaptiveSpacing);
        } else {
          // Nodes on the right side
          const distanceFromCenter = i - halfCount + 0.5;
          nodeCenterX = centralAxis + (distanceFromCenter * adaptiveSpacing);
        }
        
        positions.push({id: nodeId, centerX: nodeCenterX, width: nodeWidth});
      }
    }
    
    // Apply calculated positions to nodes, converting center positions to react-flow's top-left coordinate system
    positions.forEach(({id, centerX, width}) => {
      const node = nodeMap.get(id);
      if (node) {
        // Transform from center coordinate to left edge coordinate (React Flow uses top-left positioning)
        const leftEdgeX = centerX - (width / 2);
        
        node.position = {
          x: leftEdgeX,
          y: startY + level * verticalSpacing
        };
        
        // Store width in node data for proper rendering
        if (node.data) {
          node.data = {
            ...node.data,
            width: width
          };
        }
      }
    });
  }
  
  return Array.from(nodeMap.values());
};

// Improved force-directed layout algorithm
const applyForceLayout = (nodes: Node[], edges: Edge[]): Node[] => {
  if (nodes.length === 0) return [];
  
  // Create a deep copy of nodes to avoid mutating the original
  const nodesCopy = nodes.map(node => ({
    ...node,
    position: { ...node.position },
  }));
  
  // Center point for the layout
  const centerX = 800;
  const centerY = 400;
  
  // Create a map for quick node lookup
  const nodeMap = new Map<string, Node>();
  nodesCopy.forEach(node => nodeMap.set(node.id, node));
  
  // Initialize node positions in a circle if needed
  const radius = Math.min(600, Math.max(300, nodes.length * 20));
  nodesCopy.forEach((node, index) => {
    const angle = (index / nodesCopy.length) * 2 * Math.PI;
    node.position = {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    };
  });
  
  // Create a map of connected nodes
  const connections = new Map<string, string[]>();
  edges.forEach(edge => {
    if (!connections.has(edge.source)) {
      connections.set(edge.source, []);
    }
    connections.get(edge.source)?.push(edge.target);
    
    if (!connections.has(edge.target)) {
      connections.set(edge.target, []);
    }
    connections.get(edge.target)?.push(edge.source);
  });
  
  // Constants for force simulation
  const iterations = 100;
  const k = Math.sqrt(1000000 / nodes.length); // Optimal distance
  const gravity = 0.05;
  const initialDamping = 0.8;
  
  // Force-directed algorithm (Fruchterman-Reingold)
  for (let i = 0; i < iterations; i++) {
    // Calculate cooling factor (decreases with iterations)
    const damping = initialDamping * (1 - i / iterations);
    
    // Calculate repulsive forces
    const displacement = new Map<string, { dx: number, dy: number }>();
    nodesCopy.forEach(node => {
      displacement.set(node.id, { dx: 0, dy: 0 });
    });
    
    // Apply repulsive forces between all pairs of nodes
    for (let i = 0; i < nodesCopy.length; i++) {
      const node1 = nodesCopy[i];
      const disp1 = displacement.get(node1.id)!;
      
      for (let j = i + 1; j < nodesCopy.length; j++) {
        const node2 = nodesCopy[j];
        const disp2 = displacement.get(node2.id)!;
        
        // Calculate distance and direction
        const dx = node1.position.x - node2.position.x;
        const dy = node1.position.y - node2.position.y;
        const distance = Math.max(0.1, Math.sqrt(dx * dx + dy * dy));
        
        // Calculate repulsive force (inversely proportional to distance)
        const force = k * k / distance;
        
        // Calculate force components
        const fx = force * dx / distance;
        const fy = force * dy / distance;
        
        // Apply to both nodes in opposite directions
        disp1.dx += fx;
        disp1.dy += fy;
        disp2.dx -= fx;
        disp2.dy -= fy;
      }
    }
    
    // Apply attractive forces between connected nodes
    edges.forEach(edge => {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      
      if (source && target) {
        const dispSource = displacement.get(edge.source)!;
        const dispTarget = displacement.get(edge.target)!;
        
        // Calculate distance and direction
        const dx = source.position.x - target.position.x;
        const dy = source.position.y - target.position.y;
        const distance = Math.max(0.1, Math.sqrt(dx * dx + dy * dy));
        
        // Calculate attractive force (proportional to distance)
        const force = distance * distance / k;
        
        // Calculate force components
        const fx = force * dx / distance;
        const fy = force * dy / distance;
        
        // Apply to both nodes (attraction pulls them together)
        dispSource.dx -= fx;
        dispSource.dy -= fy;
        dispTarget.dx += fx;
        dispTarget.dy += fy;
      }
    });
    
    // Apply gravitational force toward center and update positions
    nodesCopy.forEach(node => {
      const disp = displacement.get(node.id)!;
      
      // Add gravity toward center
      disp.dx -= (node.position.x - centerX) * gravity;
      disp.dy -= (node.position.y - centerY) * gravity;
      
      // Calculate magnitude of displacement
      const magnitude = Math.sqrt(disp.dx * disp.dx + disp.dy * disp.dy);
      
      // Limit maximum displacement using damping
      const limitedMagnitude = Math.min(magnitude, 15 * damping);
      
      // Apply displacement
      if (magnitude > 0) {
        node.position.x += disp.dx / magnitude * limitedMagnitude;
        node.position.y += disp.dy / magnitude * limitedMagnitude;
      }
    });
  }
  
  return nodesCopy;
};

// Custom node component for handling multiline text
const MultiLineNode = ({ data }: { data: any }) => {
  const lines = data.label.split('\n');
  const nodeWidth = data.width || 'auto'; // Use width from layout calculation if available
  
  return (
    <div style={{ 
      padding: '10px', 
      textAlign: 'center',
      width: typeof nodeWidth === 'number' ? `${nodeWidth}px` : nodeWidth,
      boxSizing: 'border-box'
    }}>
      {lines.map((line: string, i: number) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  );
};

const NetworkGraph: React.FC<NetworkGraphProps> = ({ 
  nodes: initialNodes, 
  edges: initialEdges,
  layout = 'default' 
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Apply different layouts based on the selected option
  useEffect(() => {
    let positionedNodes: Node[];
    
    try {
      switch (layout) {
        case 'force':
          positionedNodes = applyForceLayout(initialNodes, initialEdges);
          break;
        case 'tree':
          positionedNodes = applyTreeLayout(initialNodes, initialEdges);
          break;
        default:
          // Use the original positioning from the parser
          positionedNodes = initialNodes;
      }
    } catch (error) {
      console.error("Error applying layout:", error);
      positionedNodes = initialNodes;  // Fallback to default on error
    }
    
    // Apply class-based styling to nodes and handle multi-line labels
    const styledNodes = positionedNodes.map(node => {
      // Get className from node data
      const nodeData = node.data as CustomNodeData;
      const className = nodeData.className;
      const nodeWidth = nodeData.width || 180; // Use width from layout algorithm if available
      let nodeStyle = { ...node.style };
      
      // Check if the label contains newlines
      const hasMultipleLines = nodeData.label.includes('\n');
      
      // If className exists and there's a matching style definition, apply it
      if (className && CLASS_STYLES[className]) {
        nodeStyle = {
          ...nodeStyle,
          ...CLASS_STYLES[className]
        };
      }
      
      // Add styles for multi-line text and apply calculated width
      if (hasMultipleLines) {
        nodeStyle = {
          ...nodeStyle,
          whiteSpace: 'pre-wrap',
          textAlign: 'center',
          width: `${nodeWidth}px`,
          minWidth: '180px',
          maxWidth: '400px',
        };
      } else {
        // Apply width for single-line text
        nodeStyle = {
          ...nodeStyle,
          width: `${nodeWidth}px`,
          textAlign: 'center',
        };
      }
      
      return {
        ...node,
        style: nodeStyle
      };
    });
    
    // Preserve edge styles for non-tree layouts
    let styledEdges = initialEdges;
    
    // Apply special edge type for tree layout
    if (layout === 'tree') {
      // Debug: Log initial edges to check their structure
      console.log("Initial edges before styling:", initialEdges);
      
      styledEdges = initialEdges.map(edge => {
        // Check original edge data for any indicators that this is a negative edge
        const edgeType = edge.type || '';
        
        // Log each edge's type and data for debugging
        console.log(`Processing edge ${edge.id}: type=${edgeType}, data=`, edge.data);
        
        // Expanded logic to detect negative edges:
        // 1. Check edge type for '--x' or '---'
        // 2. Check for data.negative property
        // 3. Check for data.isNegative property
        // 4. Look for "x" in the edge label if it exists
        const isNegative = 
          edgeType.includes('--x') || 
          edgeType.includes('---') || 
          (edge.data && edge.data.isNegative === true) ||
          (edge.data && edge.data.negative === true) ||
          (typeof edge.label === 'string' && edge.label.toLowerCase().includes('x'));
        
        // Log detection result
        console.log(`Edge ${edge.id} isNegative: ${isNegative}`);
        
        return {
          ...edge,
          type: 'spline', // Always use our custom spline edge for tree layout
          animated: false,
          style: {
            ...edge.style,
            stroke: isNegative ? '#cc0000' : '#2E8B57', // Red for negative, green for positive
            strokeWidth: 1.5,
            strokeDasharray: isNegative ? '5,5' : undefined, // Dashed for negative edges
          },
          data: {
            ...edge.data,
            isNegative, // Make sure to add this to data
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 13,
            height: 13,
            color: isNegative ? '#cc0000' : '#2E8B57', // Red arrow for negative edges
          }
        };
      });
      
      // Log styled edges after processing
      console.log("Styled edges after processing:", styledEdges);
    }
    
    setNodes(styledNodes);
    setEdges(styledEdges);
  }, [initialNodes, initialEdges, layout, setNodes, setEdges]);

  const onConnect = useCallback((params: any) => {
    setEdges((eds) => [...eds, params]);
  }, [setEdges]);

  // Base node style
  const baseNodeStyle = useMemo(() => {
    return {
      width: 'auto',
      padding: '12px 16px',
      fontSize: '13px',
      border: '1px solid #000',
      borderRadius: '4px',
      background: '#fff',
      boxShadow: '2px 2px 0 rgba(0,0,0,0.1)',
      textAlign: 'center' as const,
      whiteSpace: 'pre-wrap' as const,
      overflow: 'hidden',
    };
  }, []);

  // Register custom node types
  const nodeTypes = useMemo(() => ({
    multiline: MultiLineNode,
  }), []);

  // Register custom edge types
  const edgeTypes = useMemo(() => ({
    spline: SplineEdge,
  }), []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ 
          padding: 0.3,
          minZoom: 0.4,
          maxZoom: 1.5,
          duration: 0
        }}
        defaultEdgeOptions={{
          type: layout === 'tree' ? 'spline' : 'straight',
          style: { 
            strokeWidth: 1,
          }
        }}
        connectionLineType={layout === 'tree' ? ConnectionLineType.SmoothStep : ConnectionLineType.Straight}
        connectionMode={ConnectionMode.Loose}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        minZoom={0.25}
        maxZoom={2.0}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        style={{ background: '#ffffff' }}
      >
        <Controls 
          showInteractive={false}
          position="bottom-left"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            padding: '4px',
            backgroundColor: 'white',
            border: '1px solid black',
            borderRadius: '4px',
            bottom: 10,
            left: 10,
          }}
        />
        <Background 
          color="#f0f0f0" 
          gap={16} 
          size={1}
          style={{
            backgroundColor: '#ffffff',
          }}
        />
        <Panel 
          position="top-left" 
          style={{ 
            fontSize: 12, 
            color: '#666',
            padding: '6px 8px',
            backgroundColor: 'white',
            border: '1px solid #000',
            borderRadius: '4px',
            top: 10,
            left: 10,
          }}
        >
          Drag to move nodes | Scroll to zoom | Hold right click to pan
        </Panel>
      </ReactFlow>
    </div>
  );
};

export default NetworkGraph; 