import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, Button, StyleSheet, Alert,
  AppState, BackHandler, TextInput
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import NetInfo from '@react-native-community/netinfo';

import originalQuestions from './Questions';
import generatePasscode from './Passcode';

/* ---------- Utility ---------- */
const shuffleArray = (array) => {
  let arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export default function QuizApp() {
  const [screen, setScreen] = useState('home');
  const [questions, setQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [answers, setAnswers] = useState({});
  const [score, setScore] = useState(0);
  const [internetAccess, setInternetAccess] = useState(false);

  const [name, setName] = useState('');
  const [regNo, setRegNo] = useState('');
  const [dept, setDept] = useState('');
  const [year, setYear] = useState('');
  const [passcode, setPasscode] = useState('');

  const [isDetailsSubmitted, setIsDetailsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const appState = useRef(AppState.currentState);

  /* ---------- Load Questions ---------- */
  useEffect(() => {
    setQuestions(shuffleArray(originalQuestions));
  }, []);

  /* ---------- App State Protection ---------- */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current === 'active' && next !== 'active' && screen === 'quiz') {
        setScreen('result');
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [screen]);

  /* ---------- Internet + Back ---------- */
  useEffect(() => {
    const netSub = NetInfo.addEventListener(state => {
      setInternetAccess(state.isConnected && state.isInternetReachable !== false);
    });

    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'quiz') {
        Alert.alert('Warning', 'You cannot exit during the test');
        return true;
      }
      return false;
    });

    return () => {
      netSub();
      backSub.remove();
    };
  }, [screen]);

  /* ---------- Handlers ---------- */
  const handleDetailsSubmit = () => {
    if (!name || !regNo || !dept || !year || !passcode) {
      Alert.alert('Missing Info', 'Please fill all fields');
      return;
    }

    if (passcode !== generatePasscode()) {
      Alert.alert('Wrong Passcode', 'The passcode you entered is incorrect');
      return;
    }

    setIsDetailsSubmitted(true);
  };

  const handleStart = () => {
    if (internetAccess) {
      Alert.alert(
        'Internet Detected',
        'Please turn OFF your internet connection before starting the quiz'
      );
      return;
    }
    setScreen('quiz');
  };

  const handleOptionSelect = (option) => {
    setSelectedOption(option);
    setAnswers({ ...answers, [currentQuestion]: option });
  };

  const handleNext = () => {
    if (currentQuestion + 1 < questions.length) {
      setCurrentQuestion(currentQuestion + 1);
      setSelectedOption(answers[currentQuestion + 1] || null);
    } else {
      let s = 0;
      questions.forEach((q, i) => {
        if (answers[i] === q.answer) s++;
      });
      setScore(s);
      setScreen('result');
    }
  };

  const handleSubmitResult = async () => {
    if (!internetAccess) {
      Alert.alert(
        'Turn On Internet',
        'Please TURN ON internet and then submit your result'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await fetch('https://placement-app-kg7c.onrender.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          register_number: regNo,
          department: dept,
          year,
          score
        })
      });
      setIsSubmitted(true);
    } catch {
      Alert.alert('Submission Failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ---------- UI ---------- */
  return (
    <View style={styles.container}>

      {/* DETAILS PAGE */}
      {screen === 'home' && !isDetailsSubmitted && (
        <View style={styles.card}>
          <Text style={styles.title}>Student Details</Text>

          <TextInput style={styles.input} placeholder="Name" value={name} onChangeText={setName} />
          <TextInput style={styles.input} placeholder="Register Number" value={regNo} onChangeText={setRegNo} />

          <View style={styles.pickerBox}>
            <Picker selectedValue={dept} onValueChange={setDept}>
              <Picker.Item label="Select Department" value="" />
              <Picker.Item label="CSE" value="cse" />
              <Picker.Item label="IT" value="it" />
              <Picker.Item label="ECE" value="ece" />
              <Picker.Item label="MECH" value="mech" />
              <Picker.Item label="PROD" value="prod" />
              <Picker.Item label="IBT" value="ibt" />
              <Picker.Item label="EEE" value="eee" />
              <Picker.Item label="CIVIL" value="civil" />
            </Picker>
          </View>

          <TextInput style={styles.input} placeholder="Year" value={year} onChangeText={setYear} />
          <TextInput style={styles.input} placeholder="Passcode" value={passcode} onChangeText={setPasscode} />

          <Button title="Proceed" onPress={handleDetailsSubmit} />
        </View>
      )}

      {/* START PAGE */}
      {screen === 'home' && isDetailsSubmitted && (
        <View style={styles.card}>
          <Text style={styles.title}>Ready to Start</Text>

          {internetAccess && (
            <Text style={styles.warning}>
              Please turn OFF your internet connection before starting the quiz
            </Text>
          )}

          <Button title="START QUIZ" onPress={handleStart} />
        </View>
      )}

      {/* QUIZ */}
      {screen === 'quiz' && (
        <View style={styles.quiz}>
          <Text style={styles.question}>
            {currentQuestion + 1}. {questions[currentQuestion].question}
          </Text>

          {questions[currentQuestion].options.map((op, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.option, selectedOption === op && styles.selected]}
              onPress={() => handleOptionSelect(op)}
            >
              <Text>{op}</Text>
            </TouchableOpacity>
          ))}

          <Button
            title={currentQuestion === questions.length - 1 ? 'Submit' : 'Next'}
            onPress={handleNext}
            disabled={!selectedOption}
          />
        </View>
      )}

      {/* RESULT */}
      {screen === 'result' && (
        <View style={styles.card}>
          <Text style={styles.title}>Result</Text>
          <Text>Name: {name}</Text>
          <Text>Score: {score}</Text>

          {!isSubmitted && (
            <>
              <Text style={styles.warning}>
                Please TURN ON internet and then submit
              </Text>
              <Button title="Submit Result" onPress={handleSubmitResult} />
            </>
          )}

          {isSubmitting && <Text>Submitting...</Text>}
          {isSubmitted && <Text>Thank you for attending the test</Text>}
        </View>
      )}
    </View>
  );
}

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#f2f2f2',
    padding: 20
  },
  card: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    elevation: 4,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center'
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center'
  },
  input: {
    borderWidth: 1,
    borderColor: '#bbb',
    borderRadius: 6,
    padding: 10,
    marginBottom: 12
  },
  pickerBox: {
    borderWidth: 1,
    borderColor: '#bbb',
    borderRadius: 6,
    marginBottom: 12
  },
  warning: {
    color: 'red',
    textAlign: 'center',
    marginBottom: 10
  },
  quiz: {
    gap: 12
  },
  question: {
    fontSize: 18,
    fontWeight: 'bold'
  },
  option: {
    padding: 14,
    backgroundColor: '#eee',
    borderRadius: 6
  },
  selected: {
    backgroundColor: '#cdeffd'
  }
});