import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  AppState,
  AppStateStatus,
  Easing,
  Modal,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Settings } from "lucide-react";
// import * as Haptics from "expo-haptics";
import Svg, {
  Defs,
  Pattern,
  Rect,
  Stop,
  RadialGradient,
  Ellipse,
  G,
  Path,
} from "react-native-svg";

type StoredState = {
  habitName: string;
  reminderEnabled: boolean;
  currentStreak: number;
  longestStreak: number;
  lastCompletedDate: string | null;
  completionHistory: string[];
};

const STORAGE_KEY = "torch_single_candle_v1";

const BASE_BG = "#0F0F12";
const BG_CENTER = "#15151A";
const DIAMOND = "#121218";
const DAY_LABEL = "DAY";
const OFF_WHITE = "#F4F4F6";
const CANDLE_BASE = "#F2F2F2";
const CANDLE_LEFT = "#E6E6E6";
const CANDLE_RIGHT = "#F7F7F7";
const WICK = "#1C1C1C";
const FLAME_OUTER = "#F97316";
const FLAME_INNER = "#FFB347";

const DEFAULT_STATE: StoredState = {
  habitName: "Workout",
  reminderEnabled: false,
  currentStreak: 0,
  longestStreak: 0,
  lastCompletedDate: null,
  completionHistory: [],
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toLocalDateString(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateFromLocalDateString(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function daysBetween(a: string, b: string) {
  const aDate = dateFromLocalDateString(a);
  const bDate = dateFromLocalDateString(b);
  const diff = bDate.getTime() - aDate.getTime();
  return Math.round(diff / 86400000);
}

function sortHistory(history: string[]) {
  return [...new Set(history)].sort((a, b) => dateFromLocalDateString(a).getTime() - dateFromLocalDateString(b).getTime());
}

function computeLongestStreak(history: string[]) {
  const sorted = sortHistory(history);
  if (sorted.length === 0) return 0;

  let best = 1;
  let current = 1;

  for (let i = 1; i < sorted.length; i++) {
    const delta = daysBetween(sorted[i - 1], sorted[i]);
    if (delta === 1) {
      current += 1;
      best = Math.max(best, current);
    } else if (delta === 0) {
      // ignore duplicate day
    } else {
      current = 1;
    }
  }

  return best;
}

function computeCurrentStreak(history: string[], today: string) {
  const sorted = sortHistory(history);
  if (sorted.length === 0) return 0;

  const last = sorted[sorted.length - 1];
  const deltaFromLastToToday = daysBetween(last, today);

  // If the latest completion is older than yesterday, streak is dead.
  if (deltaFromLastToToday > 1) return 0;

  let streak = 1;
  for (let i = sorted.length - 1; i > 0; i--) {
    const delta = daysBetween(sorted[i - 1], sorted[i]);
    if (delta === 1) {
      streak += 1;
    } else if (delta === 0) {
      // duplicate, ignore
    } else {
      break;
    }
  }

  return streak;
}

function reconcileState(state: StoredState, today: string): StoredState {
  const history = sortHistory(state.completionHistory);
  const lastCompletedDate = history.length ? history[history.length - 1] : null;
  const currentStreak = computeCurrentStreak(history, today);
  const longestStreak = computeLongestStreak(history);

  return {
    ...state,
    completionHistory: history,
    lastCompletedDate,
    currentStreak,
    longestStreak,
  };
}

function CandleFlame({
  animatedScale,
  animatedOpacity,
  animatedRotation,
  alive,
}: {
  animatedScale: Animated.Value;
  animatedOpacity: Animated.Value;
  animatedRotation: Animated.Value;
  alive: boolean;
}) {
  const rotationInterpolate = useMemo(() => animatedRotation.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-1deg', '1deg']
  }), [animatedRotation]);

  return (
    <Animated.View
      style={[
        styles.flameWrap,
        {
          pointerEvents: "none",
          opacity: animatedOpacity as any,
          transform: [
            { scale: animatedScale as any },
            { rotate: rotationInterpolate as any }
          ],
        },
      ]}
    >
      <Svg width={37.95} height={68.6642} viewBox="0 0 44 68" preserveAspectRatio="none">
        <Path
          d="M 22 66 C 36 66, 38 48, 30 32 C 26 22, 24 12, 22 2 C 18 14, 16 24, 12 34 C 6 48, 8 66, 22 66 Z"
          fill="#F97316"
        />
        <Path
          d="M 22 62 C 28 62, 30 52, 25 42 C 23 36, 22 30, 22 22 C 20 30, 19 36, 17 42 C 12 52, 14 62, 22 62 Z"
          fill="#FFD700"
        />
      </Svg>
    </Animated.View>
  );
}

function Background({ warm }: { warm: boolean }) {
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
      <Svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <Defs>
          <Pattern id="diamondPattern" x="0" y="0" width="30" height="30" patternUnits="userSpaceOnUse">
            <PathDiamond />
          </Pattern>

          <RadialGradient id="ambientGradient" cx="50%" cy="62%" rx="60%" ry="72%">
            <Stop offset="0%" stopColor={BG_CENTER} stopOpacity={warm ? "1" : "0.85"} />
            <Stop offset="60%" stopColor={BG_CENTER} stopOpacity={warm ? "0.35" : "0.18"} />
            <Stop offset="100%" stopColor={BASE_BG} stopOpacity="1" />
          </RadialGradient>

          <RadialGradient id="warmGlow" cx="50%" cy="62%" rx="46%" ry="62%">
            <Stop offset="0%" stopColor={FLAME_OUTER} stopOpacity={warm ? "0.05" : "0"} />
            <Stop offset="100%" stopColor={FLAME_OUTER} stopOpacity="0" />
          </RadialGradient>
        </Defs>

        <Rect x="0" y="0" width="100%" height="100%" fill={BASE_BG} />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#ambientGradient)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#diamondPattern)" opacity={warm ? 0.5 : 0.28} />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#warmGlow)" />
      </Svg>
    </View>
  );
}

function PathDiamond() {
  return (
    <G>
      <Rect x="8.5" y="8.5" width="13" height="13" fill="none" stroke={DIAMOND} strokeWidth="1" transform="rotate(45 15 15)" />
    </G>
  );
}

export default function App() {
  const [state, setState] = useState<StoredState>(DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftHabitName, setDraftHabitName] = useState(DEFAULT_STATE.habitName);

  const appState = useRef<AppStateStatus>(AppState.currentState);

  const numberScale = useRef(new Animated.Value(1)).current;
  const flameScale = useRef(new Animated.Value(0)).current;
  const flameOpacity = useRef(new Animated.Value(0)).current;
  const flameRotation = useRef(new Animated.Value(0)).current;
  const ambientOpacity = useRef(new Animated.Value(0)).current;

  const today = useMemo(() => toLocalDateString(new Date()), []);
  const todayCompleted = state.lastCompletedDate === today;
  const warmState = todayCompleted && state.currentStreak > 0;

  const persist = useCallback(async (next: StoredState) => {
    setState(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed: StoredState = raw ? JSON.parse(raw) : DEFAULT_STATE;
      const reconciled = reconcileState(parsed, toLocalDateString(new Date()));
      setState(reconciled);
      setDraftHabitName(reconciled.habitName);
      setLoaded(true);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reconciled));
    } catch {
      setState(DEFAULT_STATE);
      setDraftHabitName(DEFAULT_STATE.habitName);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", async (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const parsed: StoredState = raw ? JSON.parse(raw) : DEFAULT_STATE;
        const reconciled = reconcileState(parsed, toLocalDateString(new Date()));
        setState(reconciled);
        setDraftHabitName(reconciled.habitName);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reconciled));
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!loaded) return;

    if (warmState) {
      Animated.timing(flameOpacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();

      Animated.timing(flameScale, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();

      Animated.timing(ambientOpacity, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();

      let isPulsing = true;
      const startPulse = () => {
        if (!isPulsing) return;
        Animated.sequence([
          Animated.parallel([
            Animated.timing(flameScale, {
              toValue: 1.02,
              duration: 1500,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: false,
            }),
            Animated.timing(flameRotation, {
              toValue: 1,
              duration: 1500,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: false,
            }),
          ]),
          Animated.parallel([
            Animated.timing(flameScale, {
              toValue: 1,
              duration: 1500,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: false,
            }),
            Animated.timing(flameRotation, {
              toValue: -1,
              duration: 1500,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: false,
            }),
          ]),
        ]).start(({ finished }) => {
          if (finished && isPulsing) {
            startPulse();
          }
        });
      };

      const timeout = setTimeout(startPulse, 250);

      return () => {
        isPulsing = false;
        clearTimeout(timeout);
        flameScale.stopAnimation();
        flameRotation.stopAnimation();
      };
    } else {
      Animated.timing(flameOpacity, {
        toValue: 0,
        duration: 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
      Animated.timing(flameScale, {
        toValue: 0.92,
        duration: 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
      Animated.timing(flameRotation, {
        toValue: 0,
        duration: 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
      Animated.timing(ambientOpacity, {
        toValue: 0,
        duration: 150,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }
  }, [loaded, warmState, ambientOpacity, flameOpacity, flameScale, flameRotation]);

  const animateNumber = useCallback(() => {
    numberScale.setValue(1);
    Animated.sequence([
      Animated.timing(numberScale, {
        toValue: 1.06,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(numberScale, {
        toValue: 1,
        duration: 150,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();
  }, [numberScale]);

  const completeToday = useCallback(async () => {
    const actualToday = toLocalDateString(new Date());
    const reconciled = reconcileState(state, actualToday);

    if (reconciled.lastCompletedDate === actualToday) {
      return;
    }

    const history = sortHistory([...reconciled.completionHistory, actualToday]);
    const next = reconcileState(
      {
        ...reconciled,
        completionHistory: history,
      },
      actualToday
    );

    // Haptics might not work on web, wrap in try-catch or just call it
    try {
      // await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    animateNumber();
    await persist(next);
  }, [animateNumber, persist, state]);

  const undoToday = useCallback(async () => {
    const actualToday = toLocalDateString(new Date());
    const history = sortHistory(state.completionHistory.filter((d) => d !== actualToday));
    const next = reconcileState(
      {
        ...state,
        completionHistory: history,
      },
      actualToday
    );
    await persist(next);
  }, [persist, state]);

  const onPressCandle = useCallback(() => {
    if (todayCompleted) {
      void undoToday();
      return;
    }

    void completeToday();
  }, [completeToday, todayCompleted, undoToday]);

  const saveSettings = useCallback(async () => {
    const next: StoredState = {
      ...state,
      habitName: draftHabitName.trim() || "Workout",
    };
    await persist(next);
    setSettingsOpen(false);
  }, [draftHabitName, persist, state]);

  const displayNumber = state.currentStreak;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <Background warm={warmState} />

      <Animated.View
        style={[
          styles.ambientOverlay,
          {
            pointerEvents: "none",
            opacity: ambientOpacity as any,
          },
        ]}
      />

      <View style={styles.screen}>
        <Pressable onPress={() => setSettingsOpen(true)} style={styles.gearButton}>
          <Settings color="#CFCFD6" size={20} strokeWidth={1.5} />
        </Pressable>

        <View style={styles.dayBlock}>
          <Text style={styles.dayLabel}>{DAY_LABEL}</Text>
          <Animated.View style={{ transform: [{ scale: numberScale as any }] }}>
            <Text style={styles.dayNumber}>{displayNumber}</Text>
          </Animated.View>
        </View>

        <View style={styles.candleZone}>
          <Pressable onPress={onPressCandle} style={styles.candleTapArea}>
            <View style={styles.candleOuter}>
              <View style={styles.candleTop} />
              <View style={styles.candleBody}>
                <View style={styles.candleLeftShade} />
                <View style={styles.candleRightShade} />
              </View>

              <View style={styles.wick} />

              <CandleFlame
                animatedScale={flameScale}
                animatedOpacity={flameOpacity}
                animatedRotation={flameRotation}
                alive={warmState}
              />
            </View>
          </Pressable>
          <View style={{ position: "absolute", top: "50%", bottom: 0, left: 0, right: 0, marginTop: 105.3745, justifyContent: "center", alignItems: "center" }}>
            <Text style={styles.habitName}>{state.habitName}</Text>
          </View>
        </View>

        <Modal visible={settingsOpen} transparent animationType="fade" onRequestClose={saveSettings}>
          <View style={styles.modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={saveSettings} />
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Settings</Text>

              <Text style={styles.inputLabel}>Habit name</Text>
              <TextInput
                value={draftHabitName}
                onChangeText={setDraftHabitName}
                placeholder="Workout"
                placeholderTextColor="#7A7A82"
                style={styles.input}
                onSubmitEditing={saveSettings}
                maxLength={20}
              />
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    height: "100%",
    backgroundColor: BASE_BG,
  },
  screen: {
    flex: 1,
    height: "100%",
    backgroundColor: "transparent",
  },
  ambientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(249,115,22,0.015)",
  },
  gearButton: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  dayBlock: {
    marginTop: "9%",
    alignItems: "center",
    justifyContent: "center",
  },
  dayLabel: {
    color: "rgba(237,237,237,0.70)",
    fontSize: 16,
    fontWeight: "500",
    letterSpacing: 6,
    marginBottom: 8,
  },
  dayNumber: {
    color: OFF_WHITE,
    fontSize: 84,
    fontWeight: "700",
    textAlign: "center",
    minWidth: 150,
  },
  candleZone: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  candleTapArea: {
    width: 227.7,
    height: 328.394,
    alignItems: "center",
    justifyContent: "center",
  },
  candleOuter: {
    width: 80.96,
    height: 210.749,
    alignItems: "center",
    justifyContent: "flex-start",
    position: "relative",
  },
  candleTop: {
    position: "absolute",
    top: 25.3,
    width: 80.96,
    height: 12.65,
    borderRadius: 999,
    backgroundColor: "#E9E9E9",
    zIndex: 3,
  },
  candleBody: {
    position: "absolute",
    top: 31.625,
    width: 80.96,
    height: 179.124,
    backgroundColor: CANDLE_BASE,
    borderBottomLeftRadius: 12.65,
    borderBottomRightRadius: 12.65,
    overflow: "hidden",
  },
  candleLeftShade: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: "40%",
    backgroundColor: CANDLE_LEFT,
  },
  candleRightShade: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: "34%",
    backgroundColor: CANDLE_RIGHT,
  },
  wick: {
    position: "absolute",
    top: -1.5686,
    width: 3.795,
    height: 38.8102,
    borderRadius: 3.795,
    backgroundColor: WICK,
    zIndex: 5,
  },
  flameWrap: {
    position: "absolute",
    top: -39.3788,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 6,
  },
  flameSoftCore: {
    position: "absolute",
    width: 12.65,
    height: 14.927,
    borderRadius: 999,
    backgroundColor: "rgba(255,179,71,0.12)",
  },
  habitName: {
    textAlign: "center",
    color: "rgba(237,237,237,0.72)",
    fontSize: 25,
    fontWeight: "400",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#15151A",
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: "#202026",
  },
  modalTitle: {
    color: OFF_WHITE,
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 18,
  },
  inputLabel: {
    color: "rgba(237,237,237,0.72)",
    fontSize: 14,
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#101015",
    borderColor: "#23232B",
    borderWidth: 1,
    color: OFF_WHITE,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 18,
  },
});
