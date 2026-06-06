import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';
import { buildMatchStudentPayload, normalizeAiResults, normalizeStudentData } from '../utils/profileData';
import {
  clearBasketHarvestLock,
  createEmptyWorkspace,
  isBasketHarvesting,
  markBasketHarvestStarted,
  normalizeMatchJobs,
  stripBasketHarvestLock,
} from '../services/matchWorkspace';

const DataContext = createContext(null);
const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const mergeStudentDraft = (serverStudentData, localStudentData) => {
  if (!localStudentData) return serverStudentData;
  const merged = normalizeStudentData(localStudentData);
  if (serverStudentData?.orientated || localStudentData?.orientated) {
    merged.orientated = true;
  }
  return merged;
};

export const DataProvider = ({ children }) => {
  const { user } = useAuth();
  const [studentData, setStudentData] = useState({});
  const [aiResults, setAiResults] = useState({});
  const [matchWorkspace, setMatchWorkspace] = useState(createEmptyWorkspace());
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [matching, setMatching] = useState(false);
  const [profileAiTasks, setProfileAiTasks] = useState({});
  const [isProfileDirty, setIsProfileDirty] = useState(false);
  const [ripeningStatus, setRipeningStatus] = useState({ isRipening: false, progress: 0 });

  const [showOnboarding, setShowOnboarding] = useState(false);
  const studentDataRef = useRef(studentData);
  const aiResultsRef = useRef(aiResults);
  const matchWorkspaceRef = useRef(matchWorkspace);
  const harvestInFlightRef = useRef(false);

  useEffect(() => {
    studentDataRef.current = studentData;
  }, [studentData]);

  useEffect(() => {
    aiResultsRef.current = aiResults;
  }, [aiResults]);

  useEffect(() => {
    matchWorkspaceRef.current = matchWorkspace;
  }, [matchWorkspace]);

  const getDraftKey = useCallback((suffix) => {
    const userId = user?.dbId || user?.id || 'guest';
    return `cp_draft_${userId}_${suffix}`;
  }, [user?.dbId, user?.id]);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [userData, workspaceData] = await Promise.all([
        api.get('/api/student-profile/me'),
        api.get('/api/match/workspace'),
      ]);
      
      const serverStudentData = normalizeStudentData(userData.studentData || {});
      const serverAiResults = normalizeAiResults(userData.aiResults || {});
      const serverWorkspace = workspaceData.workspace || null;
      const serverAiResultsIsEmpty = Object.keys(serverAiResults || {}).length === 0;
      const shouldIgnoreLocalAiResults = user?.username === 'admin' && serverAiResultsIsEmpty;

      // Try to load local drafts
      const localStudentData = localStorage.getItem(getDraftKey('studentData'));
      const localAiResults = localStorage.getItem(getDraftKey('aiResults'));
      const localWorkspace = localStorage.getItem(getDraftKey('matchWorkspace'));
      if (shouldIgnoreLocalAiResults) {
        localStorage.removeItem(getDraftKey('aiResults'));
      }
      
      // Merge: Local draft takes precedence if it exists
      const parsedLocalStudentData = localStudentData ? JSON.parse(localStudentData) : null;
      const finalStudentData = mergeStudentDraft(serverStudentData, parsedLocalStudentData);
        
      const finalAiResults = localAiResults && !shouldIgnoreLocalAiResults
        ? normalizeAiResults(JSON.parse(localAiResults))
        : serverAiResults;
      
      const serverWorkspaceWasReset = Boolean(
        serverWorkspace &&
        Object.keys(serverWorkspace).length === 0 &&
        workspaceData.updatedAt
      );
      if (serverWorkspaceWasReset) {
        localStorage.removeItem(getDraftKey('matchWorkspace'));
      }

      const finalWorkspace = localWorkspace && !serverWorkspaceWasReset
        ? { ...createEmptyWorkspace(), ...JSON.parse(localWorkspace) }
        : (serverWorkspace ? { ...createEmptyWorkspace(), ...serverWorkspace } : createEmptyWorkspace());

      studentDataRef.current = finalStudentData;
      aiResultsRef.current = finalAiResults;
      matchWorkspaceRef.current = finalWorkspace;
      setStudentData(finalStudentData);
      setAiResults(finalAiResults);
      setMatchWorkspace(finalWorkspace);
      
      // Auto-show onboarding only for accounts that have never completed or dismissed it
      setShowOnboarding(Boolean(finalStudentData && !finalStudentData.orientated));
      
      // Initialize dirty state: if localStorage was different from server, it's already dirty
      setIsProfileDirty(JSON.stringify(serverStudentData) !== JSON.stringify(finalStudentData));
    } catch (error) {
      console.error('Failed to load user data:', error);
    } finally {
      setLoading(false);
    }
  }, [user, getDraftKey]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Sync ripening state from workspace (e.g. after refresh or navigation)
  useEffect(() => {
    const activeBasket = matchWorkspace.currentBasket;
    if (isBasketHarvesting(activeBasket) && !ripeningStatus.isRipening && !harvestInFlightRef.current) {
      setRipeningStatus({ isRipening: true, progress: Math.max(10, Number(activeBasket.progress || 0)) });
      
      const interval = setInterval(() => {
        setRipeningStatus((prev) => {
          if (prev.progress >= 95) { // Stay at 95 until triggerHarvest finishes it
            clearInterval(interval);
            return prev;
          }
          return { ...prev, progress: prev.progress + 2 };
        });
      }, 500);
      
      return () => clearInterval(interval);
    }
  }, [matchWorkspace.currentBasket, ripeningStatus.isRipening]);

  // Wrappers to update state and localStorage
  const updateStudentData = (newData) => {
    const nextData = typeof newData === 'function' ? newData(studentDataRef.current) : newData;
    studentDataRef.current = nextData;
    setStudentData(nextData);
    setIsProfileDirty(true);
    if (user) {
      localStorage.setItem(getDraftKey('studentData'), JSON.stringify(nextData));
    }
    return nextData;
  };

  const updateAiResults = (newResults) => {
    const nextResults = typeof newResults === 'function' ? newResults(aiResultsRef.current) : newResults;
    const normalized = normalizeAiResults(nextResults);
    aiResultsRef.current = normalized;
    setAiResults(normalized);
    if (user) {
      localStorage.setItem(getDraftKey('aiResults'), JSON.stringify(normalized));
    }
    return normalized;
  };

  const updateMatchWorkspace = (newWorkspace) => {
    const nextWorkspace = typeof newWorkspace === 'function' ? newWorkspace(matchWorkspaceRef.current) : newWorkspace;
    matchWorkspaceRef.current = nextWorkspace;
    setMatchWorkspace(nextWorkspace);
    if (user) {
      localStorage.setItem(getDraftKey('matchWorkspace'), JSON.stringify(nextWorkspace));
    }
    return nextWorkspace;
  };

  const updateProfileAiTask = (type, patch) => {
    if (!type) return;
    setProfileAiTasks((prev) => ({
      ...prev,
      [type]: {
        ...(prev[type] || {}),
        ...(typeof patch === 'function' ? patch(prev[type] || {}) : patch),
      },
    }));
  };

  const saveData = async (newStudentData, optionsOrSync = false) => {
    if (!user) return;
    const nextStudentData = normalizeStudentData(newStudentData ?? studentDataRef.current);
    const syncServer = typeof optionsOrSync === 'boolean'
      ? optionsOrSync
      : Boolean(optionsOrSync?.syncServer);
    const nextAiResultsInput = typeof optionsOrSync === 'boolean'
      ? aiResultsRef.current
      : isPlainObject(optionsOrSync) && !('aiResults' in optionsOrSync) && !('syncServer' in optionsOrSync)
        ? optionsOrSync
        : optionsOrSync?.aiResults ?? aiResultsRef.current;
    const nextAiResults = updateAiResults(nextAiResultsInput);
    
    // Always update local
    updateStudentData(nextStudentData);

    if (syncServer) {
      setSyncing(true);
      try {
        await api.put('/api/user-data', {
          studentData: nextStudentData,
          aiResults: nextAiResults,
        });
        setIsProfileDirty(false);
      } catch (error) {
        console.error('Failed to sync student data to server:', error);
        throw error;
      } finally {
        setSyncing(false);
      }
    }

    return {
      studentData: nextStudentData,
      aiResults: nextAiResults,
    };
  };

  const saveAiResultsPatch = async (patchOrUpdater, options = {}) => {
    if (!user) return null;
    const patch = typeof patchOrUpdater === 'function'
      ? patchOrUpdater(aiResultsRef.current)
      : patchOrUpdater;
    const nextAiResults = {
      ...(aiResultsRef.current || {}),
      ...(patch || {}),
    };
    return saveData(studentDataRef.current, {
      aiResults: nextAiResults,
      syncServer: Boolean(options?.syncServer),
    });
  };

  const saveWorkspace = async (newWorkspace, syncServer = false) => {
    if (!user) return;
    const nextWorkspace = newWorkspace ?? matchWorkspaceRef.current;
    
    // Always update local
    updateMatchWorkspace(nextWorkspace);

    if (syncServer) {
      try {
        await api.put('/api/match/workspace', { workspace: nextWorkspace });
      } catch (error) {
        console.error('Failed to sync match workspace to server:', error);
      }
    }
  };

  const resetAllData = async () => {
    if (!user) return;
    try {
      // 1. Clear database
      await api.post('/api/user-data/reset');
      
      // 2. Clear localStorage drafts
      const prefix = `cp_draft_${user.dbId || user.id}_`;
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith(prefix)) {
          localStorage.removeItem(key);
        }
      });
      
      // 3. Reset internal state
      updateStudentData(normalizeStudentData({}));
      updateAiResults({});
      updateMatchWorkspace(createEmptyWorkspace());
      setProfileAiTasks({});
      setShowOnboarding(true); 
      
      return true;
    } catch (error) {
      console.error('Failed to reset data:', error);
      throw error;
    }
  };

  const performMatch = async (offsets = {}) => {
    if (!user || matching) return;
    setMatching(true);
    try {
      const matchStudent = buildMatchStudentPayload(studentDataRef.current, aiResultsRef.current);
      const result = await api.post('/api/match', {
        student: matchStudent,
        batch_offsets: offsets,
      });
      
      const normalized = normalizeMatchJobs(result, matchWorkspaceRef.current.jobsById);
      const nextWorkspace = {
        ...matchWorkspaceRef.current,
        ...normalized,
      };
      
      // Update locally immediately
      updateMatchWorkspace(nextWorkspace);
      setSyncing(true);
      try {
        await api.put('/api/match/workspace', { workspace: nextWorkspace });
      } finally {
        setSyncing(false);
      }
      return nextWorkspace;
    } catch (error) {
      console.error('Failed to perform match:', error);
      throw error;
    } finally {
      setMatching(false);
    }
  };

  const performMatchCheck = async (job) => {
    if (!user) return null;
    const matchStudent = buildMatchStudentPayload(studentDataRef.current, aiResultsRef.current);
    return api.post('/api/match/check', {
      student: matchStudent,
      job,
    });
  };

  const triggerHarvest = async ({ basket, basketJobs, buildHarvestRecord, buildBasketHistoryRecord, createDraftBasket }) => {
    const activeBasket = basket || matchWorkspaceRef.current.currentBasket || {};
    if (!user || harvestInFlightRef.current || ripeningStatus.isRipening || isBasketHarvesting(activeBasket)) return;

    harvestInFlightRef.current = true;
    const lockedBasket = markBasketHarvestStarted(activeBasket);
    const lockedWorkspace = {
      ...matchWorkspaceRef.current,
      currentBasket: lockedBasket,
    };
    updateMatchWorkspace(lockedWorkspace);
    setRipeningStatus({ isRipening: true, progress: 0 });
    api.put('/api/match/workspace', { workspace: lockedWorkspace }).catch((error) => {
      console.error('Failed to persist harvest lock:', error);
    });

    const interval = setInterval(() => {
      setRipeningStatus((prev) => {
        if (prev.progress >= 100) {
          clearInterval(interval);
          return { isRipening: true, progress: 100 };
        }
        return { isRipening: true, progress: prev.progress + 5 };
      });
    }, 70);

    try {
      const submittedBasket = {
        ...stripBasketHarvestLock(lockedBasket),
        status: 'Submitted',
        submittedAt: lockedBasket.submittedAt || lockedBasket.harvestStartedAt || new Date().toISOString(),
      };
      
      let response = null;
      try {
        response = await api.post('/api/match/basket/submit', {
          basket: submittedBasket,
          jobsById: matchWorkspaceRef.current.jobsById,
          student: studentDataRef.current,
        });
      } catch (error) {
        console.error('Basket submit API failed, falling back to local harvest:', error);
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));

      if (response?.workspace) {
        updateMatchWorkspace(response.workspace);
        return;
      }

      // Fallback local logic
      const harvestRecord = buildHarvestRecord(submittedBasket, basketJobs, studentDataRef.current, '');
      const basketHistoryRecord = buildBasketHistoryRecord(submittedBasket, basketJobs, harvestRecord);
      const nextBasketHistory = [basketHistoryRecord, ...(matchWorkspaceRef.current.basketHistory || [])];
      const nextHarvests = [harvestRecord, ...(matchWorkspaceRef.current.harvests || [])];
      const nextJobsById = { ...(matchWorkspaceRef.current.jobsById || {}) };

      basketJobs.forEach((job) => {
        if (nextJobsById[job.stableId]) {
          nextJobsById[job.stableId] = {
            ...nextJobsById[job.stableId],
            workspaceStatus: 'harvested',
          };
        }
      });

      const nextWorkspace = {
        ...matchWorkspaceRef.current,
        jobsById: nextJobsById,
        basketHistory: nextBasketHistory,
        harvests: nextHarvests,
        currentBasket: createDraftBasket(nextBasketHistory),
        selectedHarvestId: harvestRecord.id,
      };

      updateMatchWorkspace(nextWorkspace);
      
      // Sync to server
      try {
        await api.put('/api/match/workspace', { workspace: nextWorkspace });
      } catch (error) {
        console.error('Failed to sync harvested workspace:', error);
      }
    } catch (err) {
      console.error('Harvest failed:', err);
      const failedBasket = clearBasketHarvestLock(matchWorkspaceRef.current.currentBasket || lockedBasket, {
        harvestError: err?.message || '收割失败，请稍后重试',
      });
      const failedWorkspace = {
        ...matchWorkspaceRef.current,
        currentBasket: failedBasket,
      };
      updateMatchWorkspace(failedWorkspace);
      try {
        await api.put('/api/match/workspace', { workspace: failedWorkspace });
      } catch (error) {
        console.error('Failed to sync failed harvest state:', error);
      }
    } finally {
      harvestInFlightRef.current = false;
      clearInterval(interval);
      setRipeningStatus({ isRipening: false, progress: 0 });
    }
  };

  const syncActiveBasket = async ({ basket, jobsById }) => {
    if (!user) return null;
    const response = await api.put('/api/match/basket/active', {
      basket,
      jobsById,
    });
    return response?.workspace || null;
  };

  const dismissOnboarding = async () => {
    const nextStudentData = {
      ...normalizeStudentData(studentDataRef.current),
      orientated: true,
    };
    await saveData(nextStudentData, { aiResults: aiResultsRef.current, syncServer: true });
    setShowOnboarding(false);
    return nextStudentData;
  };

  return (
    <DataContext.Provider value={{ 
      studentData, aiResults, matchWorkspace, loading, syncing, matching, profileAiTasks,
      isProfileDirty, setIsProfileDirty,
      setStudentData: updateStudentData, 
      setAiResults: updateAiResults, 
      setMatchWorkspace: updateMatchWorkspace, 
      saveData, saveAiResultsPatch, saveWorkspace, performMatch, performMatchCheck, syncActiveBasket, refreshData: loadData,
      updateProfileAiTask,
      resetAllData,
      dismissOnboarding,
      showOnboarding, setShowOnboarding,
      ripeningStatus, triggerHarvest
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => useContext(DataContext);
