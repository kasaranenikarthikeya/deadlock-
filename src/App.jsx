import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Network, DataSet } from 'vis-network/standalone';
import axios from 'axios';
import toast, { Toaster } from 'react-hot-toast';
import { Tooltip } from 'react-tooltip';
import { jsPDF } from 'jspdf';

const App = () => {
  const [processId, setProcessId] = useState('');
  const [resourceId, setResourceId] = useState('');
  const [deadlockMessage, setDeadlockMessage] = useState('');
  const [graphState, setGraphState] = useState({ nodes: [], edges: [], history: [] });
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [isLoading, setIsLoading] = useState(false);
  const [stepMode, setStepMode] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const [showQuickStart, setShowQuickStart] = useState(true);
  const [showTutorial, setShowTutorial] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [contextMenu, setContextMenu] = useState(null);
  const [stats, setStats] = useState({ nodes: 0, edges: 0, cycles: 0, density: 0 });
  const [demoProgress, setDemoProgress] = useState(0);
  const [snapshots, setSnapshots] = useState([]);
  const [drawing, setDrawing] = useState(false);
  const [drawPoints, setDrawPoints] = useState([]);
  const networkRef = useRef(null);
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const tooltipRef = useRef(null);
  const sidebarRef = useRef(null);
  const resizeRef = useRef(null);
  const apiUrl = 'http://localhost:5000/api';

  // Initialize snapshots from localStorage
  useEffect(() => {
    const savedSnapshots = localStorage.getItem('graphSnapshots');
    if (savedSnapshots) {
      setSnapshots(JSON.parse(savedSnapshots));
    }
  }, []);

  // Sidebar resize handler
  useEffect(() => {
    const handleResize = (e) => {
      if (resizeRef.current) {
        const newWidth = Math.max(250, Math.min(600, e.clientX));
        setSidebarWidth(newWidth);
      }
    };

    const stopResize = () => {
      resizeRef.current = null;
      document.removeEventListener('mousemove', handleResize);
      document.removeEventListener('mouseup', stopResize);
    };

    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);

    return () => {
      document.removeEventListener('mousemove', handleResize);
      document.removeEventListener('mouseup', stopResize);
    };
  }, []);

  // Background particle animation
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const particles = [];
    const particleCount = 30;

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: Math.random() * 2 + 1,
        vx: Math.random() * 1.5 - 0.75,
        vy: Math.random() * 1.5 - 0.75,
      });
    }

    const animateParticles = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(45, 212, 191, 0.5)';
        ctx.fill();
      });
      requestAnimationFrame(animateParticles);
    };

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    animateParticles();
    window.addEventListener('resize', resizeCanvas);

    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  // Vis-network initialization
  useEffect(() => {
    try {
      const nodes = new DataSet(
        graphState.nodes.map(node => ({
          id: node.id,
          label: node.id,
          type: node.type,
          color: {
            background: node.type === 'process' ? '#2DD4BF' : '#F472B6',
            border: node.type === 'process' ? '#1E3A8A' : '#1E3A8A',
            highlight: { background: '#F1F5F9', border: '#2DD4BF' },
          },
          shape: node.type === 'process' ? 'dot' : 'square',
          size: 30,
          borderWidth: selectedNode === node.id ? 8 : 4,
          font: { size: 18, color: '#F1F5F9', strokeWidth: 2, strokeColor: '#0F172A' },
          shadow: { enabled: true, color: 'rgba(0,0,0,0.6)', size: 12 },
        }))
      );

      const edges = new DataSet(
        graphState.edges.map(edge => ({
          id: `${edge.from}-${edge.to}`,
          from: edge.from,
          to: edge.to,
          arrows: 'to',
          color: {
            color: edge.from.startsWith('P') ? '#10B981' : '#F472B6',
            highlight: '#2DD4BF',
          },
          width: selectedEdge === `${edge.from}-${edge.to}` ? 6 : 4,
          label: edge.from.startsWith('P') ? 'Request' : 'Allocation',
          font: { size: 16, color: '#F1F5F9', strokeWidth: 2, strokeColor: '#0F172A' },
          smooth: { type: 'curvedCW', roundness: 0.4 },
          shadow: { enabled: true, color: 'rgba(0,0,0,0.5)' },
        }))
      );

      const options = {
        nodes: {
          font: { size: 18, color: '#F1F5F9', face: 'Inter' },
          borderWidth: 4,
          shadow: { enabled: true, size: 12 },
        },
        edges: {
          width: 4,
          arrows: { to: { enabled: true, scaleFactor: 1.2 } },
          smooth: { type: 'curvedCW', roundness: 0.4 },
          shadow: { enabled: true },
        },
        physics: { enabled: true, stabilization: { iterations: 150 } },
        interaction: { dragNodes: true, zoomView: true, dragView: true, multiselect: true },
        layout: { improvedLayout: true },
      };

      if (networkRef.current) networkRef.current.destroy();
      networkRef.current = new Network(containerRef.current, { nodes, edges }, options);

      networkRef.current.on('click', (params) => {
        if (params.nodes.length > 0) {
          setSelectedNode(params.nodes[0]);
          setSelectedEdge(null);
          toast.success(`Selected Node: ${params.nodes[0]}`, { icon: '✅', style: { background: '#1E3A8A', color: '#F1F5F9' } });
          playSound('click');
        } else if (params.edges.length > 0) {
          setSelectedEdge(params.edges[0]);
          setSelectedNode(null);
          toast.success(`Selected Edge: ${params.edges[0]}`, { icon: '✅', style: { background: '#1E3A8A', color: '#F1F5F9' } });
          playSound('click');
        } else {
          setSelectedNode(null);
          setSelectedEdge(null);
          setContextMenu(null);
          if (drawing) {
            setDrawPoints([...drawPoints, params.pointer.DOM]);
          } else {
            setContextMenu({
              x: params.pointer.DOM.x,
              y: params.pointer.DOM.y,
              graphClick: true,
            });
          }
        }
      });

      networkRef.current.on('doubleClick', (params) => {
        if (params.nodes.length > 0) {
          const newLabel = prompt('Enter new node label:', params.nodes[0]);
          if (newLabel) {
            nodes.update({ id: params.nodes[0], label: newLabel });
            toast.success(`Renamed node to ${newLabel}`, { style: { background: '#10B981', color: '#F1F5F9' } });
            playSound('click');
          }
        }
      });

      networkRef.current.on('oncontext', (params) => {
        params.event.preventDefault();
        const nodeId = params.nodes[0];
        const edgeId = params.edges[0];
        if (nodeId || edgeId) {
          setContextMenu({
            x: params.pointer.DOM.x,
            y: params.pointer.DOM.y,
            nodeId,
            edgeId,
          });
        }
      });

      networkRef.current.on('hoverNode', (params) => {
        const node = nodes.get(params.node);
        tooltipRef.current.style.display = 'block';
        tooltipRef.current.style.left = `${params.pointer.DOM.x + 10}px`;
        tooltipRef.current.style.top = `${params.pointer.DOM.y + 10}px`;
        tooltipRef.current.innerHTML = `ID: ${node.id}<br>Type: ${node.type}`;
      });

      networkRef.current.on('blurNode', () => {
        tooltipRef.current.style.display = 'none';
      });

      setStats({
        nodes: graphState.nodes.length,
        edges: graphState.edges.length,
        cycles: graphState.history.filter(h => h.action === 'check_deadlock' && h.cycle).length,
        density: (graphState.edges.length / Math.max(1, graphState.nodes.length * (graphState.nodes.length - 1))).toFixed(2),
      });

      return () => networkRef.current && networkRef.current.destroy();
    } catch (error) {
      console.error('Error initializing vis-network:', error);
      toast.error('Failed to initialize graph', { style: { background: '#EF4444', color: '#F1F5F9' } });
    }
  }, [graphState, selectedNode, selectedEdge, drawing, drawPoints]);

  // Drawing overlay
  useEffect(() => {
    const canvas = containerRef.current.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const animateDraw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(45, 212, 191, 0.7)';
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 4]);
      drawPoints.forEach((point, i) => {
        if (i === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
      requestAnimationFrame(animateDraw);
    };

    if (drawing && drawPoints.length > 0) animateDraw();
  }, [drawing, drawPoints]);

  const playSound = (type) => {
    const audio = new Audio(
      type === 'click'
        ? 'https://freesound.org/data/previews/171/171671_2437358-lq.mp3'
        : type === 'node'
        ? 'https://freesound.org/data/previews/242/242503_2437358-lq.mp3'
        : 'https://freesound.org/data/previews/242/242501_2437358-lq.mp3'
    );
    audio.play().catch(() => {});
  };

  const validateInput = (id, type) => {
    if (!id) return `${type} ID cannot be empty`;
    if (graphState.nodes.some(node => node.id === id)) return `${type} ID already exists`;
    return null;
  };

  const handleAction = async (action, params = {}) => {
    if (stepMode && action !== 'nextStep') {
      toast('Step mode enabled. Click "Next Step" to proceed.', { icon: '⏸️', style: { background: '#1E3A8A', color: '#F1F5F9' } });
      return;
    }

    setIsLoading(true);
    try {
      let response;
      switch (action) {
        case 'addProcess':
          const processError = validateInput(processId, 'Process');
          if (processError) throw new Error(processError);
          response = await axios.post(`${apiUrl}/process`, { process: processId });
          if (response.data.success) {
            setProcessId('');
            toast.success(`Added Process ${processId}`, { style: { background: '#10B981', color: '#F1F5F9' } });
            playSound('node');
          }
          break;
        case 'addResource':
          const resourceError = validateInput(resourceId, 'Resource');
          if (resourceError) throw new Error(resourceError);
          response = await axios.post(`${apiUrl}/resource`, { resource: resourceId });
          if (response.data.success) {
            setResourceId('');
            toast.success(`Added Resource ${resourceId}`, { style: { background: '#10B981', color: '#F1F5F9' } });
            playSound('node');
          }
          break;
        case 'requestResource':
          if (!processId || !resourceId) throw new Error('Process and Resource IDs required');
          response = await axios.post(`${apiUrl}/request`, { process: processId, resource: resourceId });
          if (response.data.success) {
            toast.success(`Requested ${resourceId} by ${processId}`, { style: { background: '#10B981', color: '#F1F5F9' } });
            playSound('click');
          }
          break;
        case 'allocateResource':
          if (!processId || !resourceId) throw new Error('Process and Resource IDs required');
          response = await axios.post(`${apiUrl}/allocate`, { process: processId, resource: resourceId });
          if (response.data.success) {
            toast.success(`Allocated ${resourceId} to ${processId}`, { style: { background: '#F472B6', color: '#F1F5F9' } });
            playSound('click');
          }
          break;
        case 'removeNode':
          const nodeId = params.nodeId || processId || resourceId;
          if (!nodeId) throw new Error('Node ID required');
          response = await axios.delete(`${apiUrl}/node/${nodeId}`);
          if (response.data.success) {
            setProcessId('');
            setResourceId('');
            toast.success(`Removed Node ${nodeId}`, { style: { background: '#EF4444', color: '#F1F5F9' } });
            playSound('click');
            setContextMenu(null);
          }
          break;
        case 'removeEdge':
          const edgeId = params.edgeId || `${processId}-${resourceId}`;
          if (!edgeId.includes('-')) throw new Error('Invalid edge ID');
          const [from, to] = edgeId.split('-');
          response = await axios.delete(`${apiUrl}/edge`, { data: { process: from, resource: to } });
          if (response.data.success) {
            toast.success(`Removed Edge ${edgeId}`, { style: { background: '#EF4444', color: '#F1F5F9' } });
            playSound('click');
            setContextMenu(null);
          }
          break;
        case 'resetGraph':
          if (window.confirm('Are you sure you want to reset the graph? This will clear all nodes, edges, and snapshots.')) {
            response = await axios.post(`${apiUrl}/reset`);
            setProcessId('');
            setResourceId('');
            setDrawPoints([]);
            setSnapshots([]);
            setDemoProgress(0);
            setGraphState({ nodes: [], edges: [], history: [] });
            setSelectedNode(null);
            setSelectedEdge(null);
            setContextMenu(null);
            localStorage.removeItem('graphSnapshots');
            toast.success(response.data.message || 'Graph Reset', { style: { background: '#1E3A8A', color: '#F1F5F9' } });
            playSound('click');
          }
          return;
        case 'checkDeadlock':
          response = await axios.get(`${apiUrl}/deadlock`);
          setDeadlockMessage(
            response.data.cycle
              ? `Deadlock Detected: Cycle involving ${response.data.cycle.join(' -> ')}`
              : 'No Deadlock Detected'
          );
          toast(response.data.cycle ? 'Deadlock Detected!' : 'No Deadlock', {
            icon: response.data.cycle ? '⚠️' : '✅',
            style: { background: response.data.cycle ? '#EF4444' : '#10B981', color: '#F1F5F9' },
          });
          if (response.data.cycle) playSound('deadlock');
          setTimeout(() => setDeadlockMessage(''), 5000);
          break;
        case 'undo':
          response = await axios.post(`${apiUrl}/undo`);
          toast.success('Undo Action', { style: { background: '#1E3A8A', color: '#F1F5F9' } });
          playSound('click');
          break;
        case 'redo':
          response = await axios.post(`${apiUrl}/redo`);
          toast.success('Redo Action', { style: { background: '#1E3A8A', color: '#F1F5F9' } });
          playSound('click');
          break;
        case 'saveGraph':
          const canvas = containerRef.current.querySelector('canvas');
          const context = canvas.getContext('2d');
          context.font = '24px Inter';
          context.fillStyle = '#F1F5F9';
          context.fillText('Resource Allocation Graph - 2025', 20, canvas.height - 20);
          const link = document.createElement('a');
          link.download = 'resource_allocation_graph.png';
          link.href = canvas.toDataURL('image/png');
          link.click();
          toast.success('Graph Saved as PNG', { style: { background: '#10B981', color: '#F1F5F9' } });
          playSound('click');
          return;
        case 'saveJson':
          const json = JSON.stringify({ ...graphState, timestamp: new Date().toISOString() }, null, 2);
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const linkJson = document.createElement('a');
          linkJson.download = 'graph_state.json';
          linkJson.href = url;
          linkJson.click();
          URL.revokeObjectURL(url);
          toast.success('Graph Saved as JSON', { style: { background: '#10B981', color: '#F1F5F9' } });
          playSound('click');
          return;
        case 'savePdf':
          const pdfCanvas = containerRef.current.querySelector('canvas');
          const imgData = pdfCanvas.toDataURL('image/png');
          const pdf = new jsPDF();
          pdf.addImage(imgData, 'PNG', 10, 10, 190, 100);
          pdf.text('Resource Allocation Graph - 2025', 10, 120);
          pdf.save('resource_allocation_graph.pdf');
          toast.success('Graph Saved as PDF', { style: { background: '#10B981', color: '#F1F5F9' } });
          playSound('click');
          return;
        case 'saveSnapshot':
          const newSnapshots = [...snapshots, { id: Date.now(), graph: graphState }];
          setSnapshots(newSnapshots);
          localStorage.setItem('graphSnapshots', JSON.stringify(newSnapshots));
          toast.success('Snapshot Saved', { style: { background: '#10B981', color: '#F1F5F9' } });
          playSound('click');
          return;
        case 'loadSnapshot':
          setGraphState(params.graph);
          toast.success('Snapshot Loaded', { style: { background: '#10B981', color: '#F1F5F9' } });
          playSound('click');
          return;
        case 'demoMode':
          await runDemo();
          return;
        case 'nextStep':
          setStepMode(false);
          toast.success('Proceeding to next step', { style: { background: '#1E3A8A', color: '#F1F5F9' } });
          playSound('click');
          return;
        case 'toggleDrawing':
          setDrawing(!drawing);
          setDrawPoints([]);
          toast.success(drawing ? 'Drawing Disabled' : 'Drawing Enabled', { style: { background: '#1E3A8A', color: '#F1F5F9' } });
          playSound('click');
          return;
      }
      setGraphState(response.data.graph);
      networkRef.current.stabilize();
    } catch (error) {
      toast.error(
        <div>
          Error: {error.message}
          <button
            onClick={() => handleAction(action, params)}
            className="ml-2 px-2 py-1 bg-teal-500 text-white rounded-md animate-pulse"
          >
            Retry
          </button>
        </div>,
        { duration: 5000, style: { background: '#EF4444', color: '#F1F5F9' } }
      );
      console.error(`Action ${action} failed:`, error);
    } finally {
      setIsLoading(false);
    }
  };

  const runDemo = async () => {
    const steps = [
      { action: 'addProcess', process: 'P1', annotation: 'Adding Process P1' },
      { action: 'addProcess', process: 'P2', annotation: 'Adding Process P2' },
      { action: 'addResource', resource: 'R1', annotation: 'Adding Resource R1' },
      { action: 'addResource', resource: 'R2', annotation: 'Adding Resource R2' },
      { action: 'requestResource', process: 'P1', resource: 'R1', annotation: 'P1 requests R1' },
      { action: 'allocateResource', process: 'P2', resource: 'R1', annotation: 'R1 allocated to P2' },
      { action: 'requestResource', process: 'P2', resource: 'R2', annotation: 'P2 requests R2' },
      { action: 'allocateResource', process: 'P1', resource: 'R2', annotation: 'R2 allocated to P1' },
      { action: 'checkDeadlock', annotation: 'Checking for deadlock' },
    ];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      setDemoProgress(((i + 1) / steps.length) * 100);
      setIsLoading(true);
      try {
        let response;
        switch (step.action) {
          case 'addProcess':
            response = await axios.post(`${apiUrl}/process`, { process: step.process });
            toast.success(step.annotation, { style: { background: '#10B981', color: '#F1F5F9' } });
            playSound('node');
            break;
          case 'addResource':
            response = await axios.post(`${apiUrl}/resource`, { resource: step.resource });
            toast.success(step.annotation, { style: { background: '#10B981', color: '#F1F5F9' } });
            playSound('node');
            break;
          case 'requestResource':
            response = await axios.post(`${apiUrl}/request`, { process: step.process, resource: step.resource });
            toast.success(step.annotation, { style: { background: '#10B981', color: '#F1F5F9' } });
            playSound('click');
            break;
          case 'allocateResource':
            response = await axios.post(`${apiUrl}/allocate`, { process: step.process, resource: step.resource });
            toast.success(step.annotation, { style: { background: '#F472B6', color: '#F1F5F9' } });
            playSound('click');
            break;
          case 'checkDeadlock':
            response = await axios.get(`${apiUrl}/deadlock`);
            setDeadlockMessage(
              response.data.cycle
                ? `Deadlock Detected: Cycle involving ${response.data.cycle.join(' -> ')}`
                : 'No Deadlock Detected'
            );
            toast(response.data.cycle ? 'Deadlock Detected!' : 'No Deadlock', {
              icon: response.data.cycle ? '⚠️' : '✅',
              style: { background: response.data.cycle ? '#EF4444' : '#10B981', color: '#F1F5F9' },
            });
            if (response.data.cycle) playSound('deadlock');
            setTimeout(() => setDeadlockMessage(''), 5000);
            break;
        }
        setGraphState(response.data.graph);
        networkRef.current.stabilize();
        if (stepMode) {
          toast(`Paused: ${step.annotation}`, { icon: '⏸️', style: { background: '#1E3A8A', color: '#F1F5F9' } });
          setIsLoading(false);
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        toast.error(
          <div>
            Demo Error: {error.message}
            <button
              onClick={() => runDemo()}
              className="ml-2 px-2 py-1 bg-teal-500 text-white rounded-md animate-pulse"
            >
              Retry
            </button>
          </div>,
          { duration: 5000, style: { background: '#EF4444', color: '#F1F5F9' } }
        );
        setIsLoading(false);
        setDemoProgress(0);
        return;
      }
    }
    setIsLoading(false);
    setDemoProgress(0);
  };

  const zoom = (scale) => {
    networkRef.current.moveTo({ scale, animation: { duration: 500, easingFunction: 'easeInOutQuad' } });
    toast(`Zoom ${scale < 1 ? 'Out' : 'In'}`, { icon: '🔍', style: { background: '#1E3A8A', color: '#F1F5F9' } });
    playSound('click');
  };

  const toggleStepMode = () => {
    setStepMode(!stepMode);
    toast(stepMode ? 'Step Mode Disabled' : 'Step Mode Enabled', { icon: '⏯️', style: { background: '#1E3A8A', color: '#F1F5F9' } });
    playSound('click');
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
    toast.success(`Switched to ${theme === 'dark' ? 'Light' : 'Dark'} Theme`, { style: { background: '#1E3A8A', color: '#F1F5F9' } });
    playSound('click');
  };

  const handleKeyDown = useCallback(
    (e) => {
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        handleAction('undo');
      } else if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        handleAction('redo');
      } else if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handleAction('saveGraph');
      } else if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        handleAction('demoMode');
      } else if (e.ctrlKey && e.key === 't') {
        e.preventDefault();
        setShowTutorial(true);
      } else if (e.key === 'F11') {
        e.preventDefault();
        setPresentationMode(!presentationMode);
      }
    },
    [presentationMode]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      className={`flex flex-col h-screen bg-gradient-to-br from-indigo-900 to-teal-900 text-gray-100 relative overflow-hidden ${
        theme === 'dark' ? '' : 'bg-gray-100 text-gray-900'
      }`}
    >
      <canvas ref={canvasRef} className="absolute inset-0 z-0 pointer-events-none" />
      <Toaster position="top-right" toastOptions={{ duration: 4000, className: 'animate-slide-in' }} />
      <header className="bg-gradient-to-r from-teal-600 to-purple-600 p-4 shadow-lg flex justify-between items-center z-50 animate-pulse">
        <h1 className="text-2xl font-bold text-gray-100 drop-shadow-md">Resource Allocation Graph Visualizer</h1>
        <div className="flex space-x-2">
          <button
            onClick={toggleTheme}
            className="p-2 bg-teal-500 text-gray-900 rounded-full hover:bg-teal-600 transition-transform transform hover:scale-105 animate-glow"
            data-tooltip-id="theme-toggle"
            data-tooltip-content={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Theme`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
          </button>
          <button
            onClick={() => setPresentationMode(!presentationMode)}
            className="p-2 bg-teal-500 text-gray-900 rounded-full hover:bg-teal-600 transition-transform transform hover:scale-105 animate-glow"
            data-tooltip-id="presentation-mode"
            data-tooltip-content={presentationMode ? 'Exit Presentation Mode' : 'Enter Presentation Mode (F11)'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          </button>
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`p-2 bg-teal-500 text-gray-900 rounded-full hover:bg-teal-600 transition-transform transform ${
              isSidebarOpen ? 'rotate-180' : ''
            } animate-glow`}
            data-tooltip-id="sidebar-toggle"
            data-tooltip-content={isSidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </button>
        </div>
      </header>
      <div className={`flex flex-1 overflow-hidden ${presentationMode ? 'p-0' : 'p-4'}`}>
        <div
          ref={sidebarRef}
          className={`sidebar p-6 rounded-xl shadow-xl space-y-6 overflow-y-auto transition-all duration-300 z-50 ${
            isSidebarOpen ? `w-[${sidebarWidth}px] max-h-[90vh]` : 'w-0 p-0 opacity-0'
          } ${presentationMode ? 'hidden' : ''}`}
          style={{ width: isSidebarOpen ? `${sidebarWidth}px` : '0' }}
        >
          {isSidebarOpen && (
            <>
              <div
                className="absolute top-0 right-0 w-2 h-full bg-teal-500/50 cursor-col-resize animate-glow"
                onMouseDown={() => (resizeRef.current = true)}
              />
              <div className="section-divider">
                <h2 className="text-lg font-semibold text-teal-200 mb-2 flex items-center animate-fade-in">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                  Input
                </h2>
                <div>
                  <label className="block text-sm font-medium text-gray-300">Process ID</label>
                  <input
                    type="text"
                    value={processId}
                    onChange={(e) => setProcessId(e.target.value)}
                    className="mt-1 w-full p-2 bg-indigo-800 border border-teal-500 rounded-md text-gray-100 focus:ring-teal-400 focus:border-teal-400 transition-all duration-300 animate-glow"
                    placeholder="e.g., P1"
                    disabled={isLoading}
                  />
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-300">Resource ID</label>
                  <input
                    type="text"
                    value={resourceId}
                    onChange={(e) => setResourceId(e.target.value)}
                    className="mt-1 w-full p-2 bg-indigo-800 border border-teal-500 rounded-md text-gray-100 focus:ring-teal-400 focus:border-teal-400 transition-all duration-300 animate-glow"
                    placeholder="e.g., R1"
                    disabled={isLoading}
                  />
                </div>
              </div>
              <div className="section-divider">
                <h2 className="text-lg font-semibold text-teal-200 mb-2 flex items-center animate-fade-in">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                    />
                  </svg>
                  Node Actions
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    {
                      text: 'Add Process',
                      action: 'addProcess',
                      icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                        </svg>
                      ),
                      tooltip: 'Add a new process node',
                    },
                    {
                      text: 'Add Resource',
                      action: 'addResource',
                      icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                          />
                        </svg>
                      ),
                      tooltip: 'Add a new resource node',
                    },
                    {
                      text: 'Remove Node',
                      action: 'removeNode',
                      icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5-4h4M4 7h16"
                          />
                        </svg>
                      ),
                      tooltip: 'Remove selected node',
                    },
                  ].map(({ text, action, icon, tooltip }) => (
                    <button
                      key={action}
                      onClick={() => handleAction(action)}
                      className={`p-2 bg-gradient-to-r from-teal-500 to-purple-500 text-gray-100 rounded-md hover:from-teal-600 hover:to-purple-600 transition-all transform hover:scale-105 flex items-center justify-center shadow-md animate-glow ${
                        isLoading ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      disabled={isLoading}
                      data-tooltip-id={action}
                      data-tooltip-content={tooltip}
                    >
                      {isLoading && action === 'addProcess' ? (
                        <div className="spinner mr-2"></div>
                      ) : (
                        <span className="mr-2">{icon}</span>
                      )}
                      {text}
                    </button>
                  ))}
                </div>
              </div>
              <div className="section-divider">
                <h2 className="text-lg font-semibold text-teal-200 mb-2 flex items-center animate-fade-in">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                  Edge Actions
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    {
                      text: 'Request',
                      action: 'requestResource',
                      icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                        </svg>
                      ),
                      tooltip: 'Create a request edge',
                    },
                    {
                      text: 'Allocate',
                      action: 'allocateResource',
                      icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                      ),
                      tooltip: 'Create an allocation edge',
                    },
                    {
                      text: 'Remove Edge',
                      action: 'removeEdge',
                      icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      ),
                      tooltip: 'Remove selected edge',
                    },
                  ].map(({ text, action, icon, tooltip }) => (
                    <button
                      key={action}
                      onClick={() => handleAction(action)}
                      className={`p-2 bg-gradient-to-r from-teal-500 to-purple-500 text-gray-100 rounded-md hover:from-teal-600 hover:to-purple-600 transition-all transform hover:scale-105 flex items-center justify-center shadow-md animate-glow ${
                        isLoading ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      disabled={isLoading}
                      data-tooltip-id={action}
                      data-tooltip-content={tooltip}
                    >
                      {isLoading && action === 'requestResource' ? (
                        <div className="spinner mr-2"></div>
                      ) : (
                        <span className="mr-2">{icon}</span>
                      )}
                      {text}
                    </button>
                  ))}
                </div>
              </div>
              <div className="section-divider">
                <h2 className="text-lg font-semibold text-teal-200 mb-2 flex items-center animate-fade-in">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Graph Controls
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    {
                      text: 'Check Deadlock',
                      action: 'checkDeadlock',
                      icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                          />
                        </svg>
                      ),
                      tooltip: 'Detect deadlock cycles',
                    },
                    {
                      text: 'Reset Graph',
                      action: 'resetGraph',
                      icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                      ),
                      tooltip: 'Clear all nodes and edges',
                      className: 'reset-button',
                    },
                    {
                      text: 'Undo',
                      action: 'undo',
                      icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M3 10h10a8 8 0 018 8v2M3 10l6 6m0-12l-6 6"
                          />
                        </svg>
                      ),
                      tooltip: 'Undo last action (Ctrl+Z)',
                    },
                    {
                      text: 'Redo',
                      action: 'redo',
                      icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M21 14H11a8 8 0 00-8-8V4m0 2l-6 6m6-6l6 6"
                          />
                        </svg>
                      ),
                      tooltip: 'Redo undone action (Ctrl+Y)',
                    },
                    {
                      text: 'Save PNG',
                      action: 'saveGraph',
                      icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      ),
                      tooltip: 'Save graph as PNG (Ctrl+S)',
                    },
                    {
                      text: 'Save JSON',
                      action: 'saveJson',
                      icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                      ),
                      tooltip: 'Save graph state as JSON',
                    },
                    {
                      text: 'Save PDF',
                      action: 'savePdf',
                      icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l"
                            />
                            </svg>
                      ),
                      tooltip: 'Save graph as PDF',
                    },
                    {
                      text: 'Save Snapshot',
                      action: 'saveSnapshot',
                      icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15"
                          />
                        </svg>
                      ),
                      tooltip: 'Save current graph state as snapshot',
                    },
                    {
                      text: 'Toggle Drawing',
                      action: 'toggleDrawing',
                      icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                          />
                        </svg>
                      ),
                      tooltip: drawing ? 'Disable drawing mode' : 'Enable drawing mode',
                    },
                    {
                      text: 'Demo Mode',
                      action: 'demoMode',
                      icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      ),
                      tooltip: 'Run demo simulation (Ctrl+D)',
                    },
                  ].map(({ text, action, icon, tooltip, className }) => (
                    <button
                      key={action}
                      onClick={() => handleAction(action)}
                      className={`p-2 bg-gradient-to-r from-teal-500 to-purple-500 text-gray-100 rounded-md hover:from-teal-600 hover:to-purple-600 transition-all transform hover:scale-105 flex items-center justify-center shadow-md animate-glow ${className || ''} ${
                        isLoading ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      disabled={isLoading}
                      data-tooltip-id={action}
                      data-tooltip-content={tooltip}
                    >
                      {isLoading && (action === 'checkDeadlock' || action === 'resetGraph') ? (
                        <div className="spinner mr-2"></div>
                      ) : (
                        <span className="mr-2">{icon}</span>
                      )}
                      {text}
                    </button>
                  ))}
                </div>
              </div>
              <div className="section-divider">
                <h2 className="text-lg font-semibold text-teal-200 mb-2 flex items-center animate-fade-in">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  Statistics
                </h2>
                <div className="card bg-gray-800 p-4 rounded-md shadow-inner animate-scale-in">
                  <p className="text-sm text-gray-300">Nodes: <span className="font-bold text-teal-400">{stats.nodes}</span></p>
                  <p className="text-sm text-gray-300">Edges: <span className="font-bold text-teal-400">{stats.edges}</span></p>
                  <p className="text-sm text-gray-300">Cycles: <span className="font-bold text-teal-400">{stats.cycles}</span></p>
                  <p className="text-sm text-gray-300">Density: <span className="font-bold text-teal-400">{stats.density}</span></p>
                </div>
              </div>
              <div className="section-divider">
                <h2 className="text-lg font-semibold text-teal-200 mb-2 flex items-center animate-fade-in">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                    />
                  </svg>
                  Snapshots
                </h2>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {snapshots.map(snapshot => (
                    <div
                      key={snapshot.id}
                      className="history-item bg-gray-800 p-2 rounded-md cursor-pointer hover:bg-indigo-700 transition-all animate-scale-in"
                      onClick={() => handleAction('loadSnapshot', { graph: snapshot.graph })}
                    >
                      <p className="text-sm text-gray-300">Snapshot {new Date(snapshot.id).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="section-divider">
                <h2 className="text-lg font-semibold text-teal-200 mb-2 flex items-center animate-fade-in">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                    />
                  </svg>
                  Demo Progress
                </h2>
                <div className="w-full bg-gray-800 rounded-full h-2.5">
                  <div
                    className="bg-teal-500 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${demoProgress}%` }}
                  ></div>
                </div>
                <button
                  onClick={toggleStepMode}
                  className={`mt-3 w-full p-2 bg-gradient-to-r from-teal-500 to-purple-500 text-gray-100 rounded-md hover:from-teal-600 hover:to-purple-600 transition-all transform hover:scale-105 flex items-center justify-center shadow-md animate-glow ${
                    isLoading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  disabled={isLoading}
                  data-tooltip-id="step-mode"
                  data-tooltip-content={stepMode ? 'Disable Step Mode' : 'Enable Step Mode'}
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d={stepMode ? 'M10 9v6m4-6v6m-8 0h12' : 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z'}
                    />
                  </svg>
                  {stepMode ? 'Disable Step Mode' : 'Enable Step Mode'}
                </button>
                {stepMode && (
                  <button
                    onClick={() => handleAction('nextStep')}
                    className="mt-2 w-full p-2 bg-gradient-to-r from-teal-500 to-purple-500 text-gray-100 rounded-md hover:from-teal-600 hover:to-purple-600 transition-all transform hover:scale-105 flex items-center justify-center shadow-md animate-glow"
                    data-tooltip-id="next-step"
                    data-tooltip-content="Proceed to next step"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                    Next Step
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        <div
          className={`flex-1 bg-gray-900 rounded-xl shadow-2xl overflow-hidden relative transition-all duration-300 ${
            presentationMode ? 'm-0' : 'm-4'
          }`}
        >
          <div ref={containerRef} id="graph-container" className="w-full h-full animate-fade-in"></div>
          {deadlockMessage && (
            <div className="absolute top-4 left-4 bg-red-600 text-gray-100 p-4 rounded-md shadow-lg max-w-md animate-scale-in">
              <p className="text-sm">{deadlockMessage}</p>
            </div>
          )}
          {contextMenu && (
            <div
              className="absolute bg-indigo-800 text-gray-100 rounded-md shadow-lg p-2 z-50 animate-scale-in"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              {contextMenu.nodeId && (
                <button
                  onClick={() => handleAction('removeNode', { nodeId: contextMenu.nodeId })}
                  className="block w-full text-left px-4 py-2 hover:bg-indigo-700 rounded-md"
                >
                  Remove Node
                </button>
              )}
              {contextMenu.edgeId && (
                <button
                  onClick={() => handleAction('removeEdge', { edgeId: contextMenu.edgeId })}
                  className="block w-full text-left px-4 py-2 hover:bg-indigo-700 rounded-md"
                >
                  Remove Edge
                </button>
              )}
              {contextMenu.graphClick && (
                <>
                  <button
                    onClick={() => {
                      const id = prompt('Enter Process ID (e.g., P1):');
                      if (id) handleAction('addProcess', { process: id });
                      setContextMenu(null);
                    }}
                    className="block w-full text-left px-4 py-2 hover:bg-indigo-700 rounded-md"
                  >
                    Add Process
                  </button>
                  <button
                    onClick={() => {
                      const id = prompt('Enter Resource ID (e.g., R1):');
                      if (id) handleAction('addResource', { resource: id });
                      setContextMenu(null);
                    }}
                    className="block w-full text-left px-4 py-2 hover:bg-indigo-700 rounded-md"
                  >
                    Add Resource
                  </button>
                </>
              )}
            </div>
          )}
          <div className="absolute bottom-4 right-4 flex space-x-2">
            <button
              onClick={() => zoom(networkRef.current.getScale() * 1.2)}
              className="p-2 bg-teal-500 text-gray-900 rounded-full hover:bg-teal-600 transition-transform transform hover:scale-105 animate-glow"
              data-tooltip-id="zoom-in"
              data-tooltip-content="Zoom In"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
                />
              </svg>
            </button>
            <button
              onClick={() => zoom(networkRef.current.getScale() / 1.2)}
              className="p-2 bg-teal-500 text-gray-900 rounded-full hover:bg-teal-600 transition-transform transform hover:scale-105 animate-glow"
              data-tooltip-id="zoom-out"
              data-tooltip-content="Zoom Out"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM7 10h6"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
      {showQuickStart && (
        <div className="absolute inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 animate-fade-in">
          <div className="card bg-gray-800 p-8 rounded-xl shadow-2xl max-w-md text-center space-y-4">
            <h2 className="text-2xl font-bold text-teal-400">Welcome to Resource Allocation Graph Visualizer</h2>
            <p className="text-gray-300">Simulate and visualize resource allocation and detect deadlocks in operating systems.</p>
            <div className="space-y-2">
              <p className="text-sm text-gray-400">Use the sidebar to add processes and resources, create edges, and check for deadlocks.</p>
              <p className="text-sm text-gray-400">Right-click on the graph for context actions, or use Ctrl+Z/Y for undo/redo.</p>
              <p className="text-sm text-gray-400">Press Ctrl+D to run a demo or Ctrl+T for a tutorial.</p>
            </div>
            <button
              onClick={() => setShowQuickStart(false)}
              className="p-2 bg-gradient-to-r from-teal-500 to-purple-500 text-gray-100 rounded-md hover:from-teal-600 hover:to-purple-600 transition-all transform hover:scale-105 animate-glow"
            >
              Get Started
            </button>
          </div>
        </div>
      )}
      {showTutorial && (
        <div className="absolute inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 animate-fade-in">
          <div className="card bg-gray-800 p-8 rounded-xl shadow-2xl max-w-lg space-y-4">
            <h2 className="text-2xl font-bold text-teal-400">Interactive Tutorial</h2>
            <p className="text-gray-300">Follow these steps to learn how to use the visualizer:</p>
            <ol className="list-decimal list-inside text-gray-300 space-y-2">
              <li>Enter a Process ID (e.g., P1) and click "Add Process".</li>
              <li>Enter a Resource ID (e.g., R1) and click "Add Resource".</li>
              <li>Select Process and Resource IDs, then click "Request" or "Allocate" to create edges.</li>
              <li>Click "Check Deadlock" to detect cycles in the graph.</li>
              <li>Use "Undo" (Ctrl+Z) or "Redo" (Ctrl+Y) to navigate actions.</li>
              <li>Save the graph as PNG, JSON, or PDF using the respective buttons.</li>
              <li>Enable "Step Mode" for controlled demo execution or run the full demo with Ctrl+D.</li>
            </ol>
            <button
              onClick={() => setShowTutorial(false)}
              className="p-2 bg-gradient-to-r from-teal-500 to-purple-500 text-gray-100 rounded-md hover:from-teal-600 hover:to-purple-600 transition-all transform hover:scale-105 animate-glow"
            >
              Close Tutorial
            </button>
          </div>
        </div>
      )}
      <div ref={tooltipRef} className="tooltip hidden"></div>
      {[
        'theme-toggle',
        'presentation-mode',
        'sidebar-toggle',
        'addProcess',
        'addResource',
        'removeNode',
        'requestResource',
        'allocateResource',
        'removeEdge',
        'checkDeadlock',
        'resetGraph',
        'undo',
        'redo',
        'saveGraph',
        'saveJson',
        'savePdf',
        'saveSnapshot',
        'toggleDrawing',
        'demoMode',
        'step-mode',
        'next-step',
        'zoom-in',
        'zoom-out',
      ].map(id => (
        <Tooltip key={id} id={id} place="top" effect="solid" className="tooltip" />
      ))}
    </div>
  );
};

export default App;
                            