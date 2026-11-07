import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

const NavigationContext = createContext();

export const NavigationProvider = ({ children }) => {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [currentFloor, setCurrentFloor] = useState(0);
  const [accessibleOnly, setAccessibleOnly] = useState(false);

  const [startNodeId, setStartNodeId] = useState('GF-MAIN-ENTRANCE');
  const [destinationNodeId, setDestinationNodeId] = useState('1F-CLASS-02');

  const [routeResult, setRouteResult] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [sheetSnap, setSheetSnap] = useState('peek'); // 'closed' | 'peek' | 'half' | 'full'

  // Augmented Reality (AR) Live Camera Navigation state
  const [isARMode, setIsARMode] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);

  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type, id: Date.now() });
    setTimeout(() => {
      setToast((prev) => (prev && Date.now() - prev.id >= 3400 ? null : prev));
    }, 3500);
  }, []);

  const refreshMapData = useCallback(async () => {
    try {
      const [fetchedNodes, fetchedEdges] = await Promise.all([
        api.getNodes(),
        api.getEdges(),
      ]);
      setNodes(fetchedNodes);
      setEdges(fetchedEdges);
      return { fetchedNodes, fetchedEdges };
    } catch (err) {
      console.error('Failed to load map data:', err);
      showToast('Unable to connect to navigation server', 'error');
      return { fetchedNodes: [], fetchedEdges: [] };
    }
  }, [showToast]);

  const computeRoute = useCallback(
    async (start = startNodeId, dest = destinationNodeId, accessible = accessibleOnly, allNodes = nodes) => {
      if (!start || !dest) return null;
      setRouteLoading(true);
      try {
        const result = await api.getRoute({
          startNodeId: start,
          destinationNodeId: dest,
          accessibleOnly: accessible,
        });
        setRouteResult(result);
        setActiveStepIndex(0);
        setSheetSnap((prev) => (prev === 'closed' ? 'peek' : prev));

        const startObj = allNodes.find((n) => n.nodeId === start);
        if (startObj) {
          setCurrentFloor(startObj.floor);
        }
        return result;
      } catch (err) {
        setRouteResult(null);
        showToast(err.message || 'Could not calculate route', 'error');
        return null;
      } finally {
        setRouteLoading(false);
      }
    },
    [startNodeId, destinationNodeId, accessibleOnly, nodes, showToast]
  );

  // Initial load + default route
  useEffect(() => {
    let mounted = true;
    refreshMapData().then(({ fetchedNodes }) => {
      if (mounted && fetchedNodes.length > 0) {
        computeRoute('GF-MAIN-ENTRANCE', '1F-CLASS-02', false, fetchedNodes);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Re-run route when accessible mode toggles
  useEffect(() => {
    if (nodes.length > 0 && startNodeId && destinationNodeId && routeResult) {
      computeRoute(startNodeId, destinationNodeId, accessibleOnly, nodes);
    }
  }, [accessibleOnly]);

  const clearRoute = useCallback(() => {
    setRouteResult(null);
    setDestinationNodeId('');
    setActiveStepIndex(0);
    setIsARMode(false);
    setSheetSnap('closed');
  }, []);

  // Smoothly exit AR mode and fallback to standard 2D FloorMap.jsx view
  const fallbackTo2DMap = useCallback(
    (reason, type = 'info') => {
      setIsARMode(false);
      if (reason) {
        showToast(reason, type);
      }
    },
    [showToast]
  );

  // Toggle into AR mode immediately so ARView.jsx presents its explicit "Start AR Session" user-gesture overlay
  const launchARLiveView = useCallback(() => {
    if (!routeResult?.path || routeResult.path.length < 2) {
      showToast('Select a route destination first to start AR Live View', 'info');
      return false;
    }

    setSheetSnap('peek');
    setIsARMode(true);
    return true;
  }, [routeResult, showToast]);

  const startNodeObj = nodes.find((n) => n.nodeId === startNodeId) || null;
  const destNodeObj = nodes.find((n) => n.nodeId === destinationNodeId) || null;

  return (
    <NavigationContext.Provider
      value={{
        nodes,
        edges,
        refreshMapData,
        currentFloor,
        setCurrentFloor,
        accessibleOnly,
        setAccessibleOnly,
        startNodeId,
        setStartNodeId,
        destinationNodeId,
        setDestinationNodeId,
        startNodeObj,
        destNodeObj,
        routeResult,
        setRouteResult,
        routeLoading,
        computeRoute,
        clearRoute,
        sheetSnap,
        setSheetSnap,
        isARMode,
        setIsARMode,
        activeStepIndex,
        setActiveStepIndex,
        launchARLiveView,
        fallbackTo2DMap,
        toast,
        showToast,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigation = () => useContext(NavigationContext);
