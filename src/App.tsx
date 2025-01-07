// src/App.tsx

import React, { useState, useRef, useEffect } from "react";
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import { Download, Trash2, Plus, X, Check, Mic, MicOff } from "lucide-react";
import "@fontsource/roboto/300.css"; // Roboto Light font
import ReactCountryFlag from "react-country-flag"; // For displaying country flags
import logo from "./assets/logo.png"; // Ensure you have a logo in src/assets/
import { AudioVisualizer } from "./components/AudioVisualizer";
import { motion } from "framer-motion";
import { debounce } from "lodash";

// Access environment variables via import.meta.env for Vite
const speechKey = import.meta.env.VITE_SPEECH_KEY?.trim() || "";
const serviceRegion = import.meta.env.VITE_SPEECH_REGION?.trim() || "";

// Define the complete list of languages used for both source and target
const languages: { code: string; name: string }[] = [
    { code: "en", name: "Anglais" },
    { code: "fr", name: "Français" },
    { code: "es", name: "Espagnol" },
    { code: "pl", name: "Polonais" },
    { code: "de", name: "Allemand" },
    { code: "it", name: "Italien" },
    { code: "zh", name: "Chinois" },
    { code: "ko", name: "Coréen" },
    { code: "ar", name: "Arabe" },
    { code: "pt", name: "Portugais" },
    { code: "ru", name: "Russe" },
    { code: "uk", name: "Ukrainien" },
    // Add more languages as desired
];

// Function to map language codes to country codes for flags
const getCountryCode = (languageCode: string) => {
    const countryMap: { [key: string]: string } = {
        pl: "PL",
        en: "US", // English - United States
        fr: "FR",
        es: "ES",
        de: "DE",
        it: "IT",
        zh: "CN",
        ko: "KR",
        ar: "SA",
        pt: "PT",
        ru: "RU",
        uk: "UA", // Ukrainian
    };
    return countryMap[languageCode] || "US"; // Default to "US" if not found
};

// Predefined Scientific Terms per Language
const predefinedScientificTerms: { [key: string]: string[] } = {
    pl: ["mechanika kwantowa", "neuronauka", "fotosynteza"], // Polish terms
    en: ["quantum mechanics", "neuroscience", "photosynthesis"],
    fr: ["mécanique quantique", "neurosciences", "photosynthèse"],
    es: ["mecánica cuántica", "neurociencias", "fotosíntesis"],
    // Add more languages and terms as needed
};

// Define Phrase Lists per Language (initially empty, users can add)
const initialPhraseLists: { [key: string]: string[] } = languages.reduce((acc, lang) => {
    acc[lang.code] = [];
    return acc;
}, {} as { [key: string]: string[] });

// Voice names mapping based on language
const voiceMap: { [key: string]: string } = {
    pl: "pl-PL-AgnieszkaNeural",
    en: "en-US-JennyNeural",
    fr: "fr-FR-DeniseNeural",
    es: "es-ES-AlvaroNeural", // Updated to a likely available voice
    de: "de-DE-KatjaNeural",
    it: "it-IT-ElsaNeural",
    zh: "zh-CN-XiaoxiaoNeural",
    ko: "ko-KR-SunHiNeural",
    ar: "ar-SA-SalmaNeural",
    pt: "pt-PT-CamilaNeural",
    ru: "ru-RU-IrinaNeural",
    uk: "uk-UA-OstapNeural",
    // Add more mappings as needed
};

function App() {
    // State variables
    const [transcription, setTranscription] = useState("");
    const [translation, setTranslation] = useState("");
    const [isRecognizing, setIsRecognizing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // State for accumulated session transcription
    const [sessionTranscription, setSessionTranscription] = useState<string>("");

    // State to control visibility of transcription sections
    const [showTranscriptionSections, setShowTranscriptionSections] = useState<boolean>(false);

    // Define target languages
    const targetLanguages: { code: string; name: string }[] = languages;

    // Define source languages
    const sourceLanguages: { code: string; name: string }[] = languages;

    // Initialize source and target language states
    const [sourceLanguage, setSourceLanguage] = useState<string>("fr"); // Default to French
    const [targetLanguage, setTargetLanguage] = useState<string>("pl"); // Default to Polish

    // State for audio input devices
    const [audioInputDevices, setAudioInputDevices] = useState<
        { deviceId: string; label: string }[]
    >([]);
    const [selectedAudioInputDevice, setSelectedAudioInputDevice] = useState<string>("");

    // State for phrase list: language-specific
    const [phraseInput, setPhraseInput] = useState<string>(""); // Current input field
    const [phraseList, setPhraseList] = useState<{ [key: string]: string[] }>(initialPhraseLists); // List of phrases per language

    // State for audio playback speed
    const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0); // Default speed 1.0

    // State to prevent overlapping synthesizations
    const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);

    // Add playbackSpeedRef
    const playbackSpeedRef = useRef<number>(playbackSpeed);

    // Update playbackSpeedRef when playbackSpeed changes
    useEffect(() => {
        playbackSpeedRef.current = playbackSpeed;
    }, [playbackSpeed]);

    // Refs for recognizer and synthesizer
    const translationRecognizerRef = useRef<SpeechSDK.TranslationRecognizer | null>(null);
    const synthRef = useRef<SpeechSDK.SpeechSynthesizer | null>(null);
    const stopInProgressRef = useRef(false);

    // Debounced function to apply phrases to recognizer
    const debouncedApplyPhrases = useRef(
        debounce(
            (recognizer: SpeechSDK.SpeechRecognizer | SpeechSDK.TranslationRecognizer) => {
                addPhrasesToRecognizer(recognizer);
            },
            500
        )
    ).current;

    // Enumerate audio input devices on component mount
    useEffect(() => {
        const enumerateDevices = async () => {
            try {
                console.log("Requesting microphone access...");
                // Request microphone access to get device labels (requires user permission)
                await navigator.mediaDevices.getUserMedia({ audio: true });
                console.log("Microphone access granted.");
                const devices = await navigator.mediaDevices.enumerateDevices();
                const audioInputs = devices
                    .filter((device) => device.kind === "audioinput")
                    .map((device) => ({
                        deviceId: device.deviceId,
                        label: device.label || `Microphone ${device.deviceId}`,
                    }));
                setAudioInputDevices(audioInputs);
                console.log("Audio input devices:", audioInputs);
                // Set default device if not already selected
                if (audioInputs.length > 0 && !selectedAudioInputDevice) {
                    setSelectedAudioInputDevice(audioInputs[0].deviceId);
                    console.log(`Default audio input device set to: ${audioInputs[0].label}`);
                }
            } catch (err) {
                console.error("Error enumerating audio devices:", err);
                setError("Unable to access audio devices. Please check your microphone permissions.");
            }
        };

        enumerateDevices();
    }, []); // Run once on mount

    // Load phrase lists from local storage on mount
    useEffect(() => {
        const savedPhrases = localStorage.getItem("phraseList");
        if (savedPhrases) {
            setPhraseList(JSON.parse(savedPhrases));
            console.log("Phrase lists loaded from local storage.");
        }
    }, []);

    // Save phrase lists to local storage whenever they change
    useEffect(() => {
        localStorage.setItem("phraseList", JSON.stringify(phraseList));
    }, [phraseList]);

    // Cleanup on component unmount
    useEffect(() => {
        return () => {
            stopRecognition();
            if (synthRef.current) {
                try {
                    synthRef.current.close();
                    console.log("Synthesizer closed on unmount");
                } catch (error) {
                    console.warn("Synthesizer already closed on unmount:", error);
                }
            }
            if (translationRecognizerRef.current) {
                try {
                    translationRecognizerRef.current.close();
                } catch (error) {
                    console.warn("Translation recognizer already closed on unmount:", error);
                }
            }
        };
    }, []);

    // Helper function to append or replace session transcription
    const appendOrReplaceSessionTranscription = (newText: string) => {
        setSessionTranscription((prev) => {
            const lines = prev.split("\n");
            // Find the last index of a line starting with "Translation:"
            const lastTranslationIndex = lines.reduce(
                (lastIndex, line, index) => {
                    return line.startsWith("Translation:") ? index : lastIndex;
                },
                -1
            );

            if (lastTranslationIndex !== -1) {
                // Replace the last translation line with the new one
                lines[lastTranslationIndex] = newText;
                return lines.join("\n");
            } else {
                // Append as a new line if no previous translation exists
                return prev + (prev ? "\n" : "") + newText;
            }
        });
    };

    // Validate Phrase Function
    const isValidPhrase = (phrase: string): boolean => {
        // Allow letters, numbers, spaces, and common punctuation
        const regex = /^[\p{L}\p{N}\s.,'-]+$/u;
        return regex.test(phrase);
    };

    // Normalize Phrase Function
    const normalizePhrase = (phrase: string): string => {
        return phrase.normalize("NFC"); // Normalize to Unicode NFC form
    };

    // Handle Add Phrase
    const handleAddPhrase = () => {
        const trimmedPhrase = normalizePhrase(phraseInput.trim());
        if (
            trimmedPhrase &&
            isValidPhrase(trimmedPhrase) &&
            !phraseList[sourceLanguage]?.includes(trimmedPhrase)
        ) {
            setPhraseList({
                ...phraseList,
                [sourceLanguage]: [...(phraseList[sourceLanguage] || []), trimmedPhrase],
            });
            setPhraseInput("");
            setSuccessMessage("Phrase ajoutée avec succès !");
            console.log(`[${sourceLanguage}] Phrase ajoutée: "${trimmedPhrase}"`);
            // Clear success message after 3 seconds
            setTimeout(() => setSuccessMessage(null), 3000);
        } else {
            setError("Phrase invalide ou en double. Veuillez vous assurer qu'elle contient des caractères valides et est unique.");
        }
    };

    // Handle Add Predefined Phrase
    const handleAddPredefinedPhrase = (phrase: string) => {
        if (!phraseList[sourceLanguage]?.includes(phrase)) {
            setPhraseList({
                ...phraseList,
                [sourceLanguage]: [...(phraseList[sourceLanguage] || []), phrase],
            });
            setSuccessMessage("Phrase prédéfinie ajoutée avec succès !");
            console.log(`[${sourceLanguage}] Phrase prédéfinie ajoutée: "${phrase}"`);
            // Clear success message after 3 seconds
            setTimeout(() => setSuccessMessage(null), 3000);
        }
    };

    // Handle Remove Phrase
    const handleRemovePhrase = (phrase: string) => {
        setPhraseList({
            ...phraseList,
            [sourceLanguage]: (phraseList[sourceLanguage] || []).filter((p) => p !== phrase),
        });
        setSuccessMessage("Phrase supprimée avec succès !");
        console.log(`[${sourceLanguage}] Phrase supprimée: "${phrase}"`);
        // Clear success message after 3 seconds
        setTimeout(() => setSuccessMessage(null), 3000);
    };

    // Handle Clear Phrases
    const handleClearPhrases = () => {
        setPhraseList({
            ...phraseList,
            [sourceLanguage]: [],
        });
        setSuccessMessage("Toutes les phrases ont été effacées.");
        console.log(`Toutes les phrases ont été effacées pour ${sourceLanguage}.`);
        // Clear success message after 3 seconds
        setTimeout(() => setSuccessMessage(null), 3000);
    };

    // Handle Phrase Input Key Down (Enter key)
    const handlePhraseInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleAddPhrase();
        }
    };

    // Function to add phrases to recognizer using PhraseListGrammar
    const addPhrasesToRecognizer = (
        recognizer: SpeechSDK.SpeechRecognizer | SpeechSDK.TranslationRecognizer
    ): boolean => {
        try {
            const phraseListConstraint = SpeechSDK.PhraseListGrammar.fromRecognizer(recognizer);
            const currentPhrases = phraseList[sourceLanguage] || [];

            if (currentPhrases.length > 0) {
                const allStrings = currentPhrases.every(
                    (phrase) => typeof phrase === "string" && phrase.trim().length > 0
                );
                if (!allStrings) {
                    setError("La liste de phrases contient des entrées invalides.");
                    return false;
                }

                currentPhrases.forEach((phrase) => {
                    console.log(`[${sourceLanguage}] Ajout de la phrase: "${phrase}"`);
                    phraseListConstraint.addPhrase(phrase);
                });
                console.log(`[${sourceLanguage}] Toutes les phrases ont été ajoutées avec succès.`);
            }
            return true;
        } catch (error: any) {
            console.error(`[${sourceLanguage}] Erreur lors de l'ajout des phrases au reconnaisseur:`, error);
            setError(`Erreur lors de l'ajout des phrases à la liste de phrases: ${error.message || error}`);
            return false;
        }
    };

    // Start Recognition Function
    const startRecognition = async () => {
        console.log("Bouton Démarrer la Reconnaissance cliqué.");

        if (isRecognizing) {
            console.warn("La reconnaissance est déjà en cours.");
            return;
        }

        if (!speechKey || !serviceRegion) {
            console.error("Les informations d'identification du service de reconnaissance vocale sont manquantes.");
            setError("Les informations d'identification du service de reconnaissance vocale sont manquantes.");
            return;
        }

        // Ensure all recognizers are stopped before starting a new one
        await stopRecognition();

        setTranscription("");
        setTranslation("");
        setError(null);
        setIsRecognizing(true);
        setShowTranscriptionSections(true); // Show transcription sections upon starting

        try {
            const languageMap: { [key: string]: string } = languages.reduce((acc, lang) => {
                acc[lang.code] = getLocaleCode(lang.code);
                return acc;
            }, {} as { [key: string]: string });

            const mappedSourceLanguage = languageMap[sourceLanguage] || "en-US";

            console.log("Initialisation de SpeechTranslationConfig.");
            const speechConfig = SpeechSDK.SpeechTranslationConfig.fromSubscription(speechKey, serviceRegion);
            speechConfig.speechRecognitionLanguage = mappedSourceLanguage;
            speechConfig.addTargetLanguage(targetLanguage);
            speechConfig.setProfanity(SpeechSDK.ProfanityOption.Raw); // Allow profanity in translation

            console.log("SpeechTranslationConfig initialisé:", speechConfig);

            // Use selected audio input device
            const audioConfig = selectedAudioInputDevice
                ? SpeechSDK.AudioConfig.fromMicrophoneInput(selectedAudioInputDevice)
                : SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();

            console.log("AudioConfig pour TranslationRecognizer:", audioConfig);

            // Create the translation recognizer
            const recognizer = new SpeechSDK.TranslationRecognizer(speechConfig, audioConfig);
            console.log("TranslationRecognizer créé:", recognizer);

            // Add phrases specific to the source language
            const phrasesAdded = addPhrasesToRecognizer(recognizer);
            if (!phrasesAdded) {
                recognizer.close();
                setIsRecognizing(false);
                return;
            }

            translationRecognizerRef.current = recognizer;

            // Set up event handlers
            recognizer.recognizing = (s, e) => {
                const text = e.result.text;
                const translationText = e.result.translations.get(targetLanguage) || "";
                setTranscription(text);
                setTranslation(translationText);
                appendOrReplaceSessionTranscription(`Translation: ${translationText}`);
                console.log(`[${targetLanguage}] Reconnaissance: ${text} | Traduction: ${translationText}`);
            };

            recognizer.recognized = (s, e) => {
                console.log(`[${targetLanguage}] Événement recognized déclenché.`);
                if (e.result.reason === SpeechSDK.ResultReason.TranslatedSpeech) {
                    const text = e.result.text;
                    const translationText = e.result.translations.get(targetLanguage) || "";
                    setTranscription(text);
                    setTranslation(translationText);
                    appendOrReplaceSessionTranscription(`Translation: ${translationText}`);
                    console.log(`[${targetLanguage}] Discours traduit: ${translationText}`);
                    synthesizeSpeech(translationText, playbackSpeedRef.current); // Use ref
                } else {
                    console.warn(`[${targetLanguage}] Discours traduit non reconnu. Raison:`, e.result.reason);
                }
            };

            recognizer.canceled = (s, e) => {
                console.error(`[${targetLanguage}] Reconnaissance traduite annulée:`, e.errorDetails);
                setError(`Traduction annulée: ${e.errorDetails}`);
                stopRecognition();
            };

            recognizer.sessionStopped = () => {
                console.log(`[${targetLanguage}] Session de reconnaissance traduite arrêtée`);
                stopRecognition();
            };

            recognizer.startContinuousRecognitionAsync(
                () => {
                    console.log("Reconnaissance traduite démarrée");
                },
                (err) => {
                    console.error("Échec du démarrage de la reconnaissance traduite:", err);
                    setError("Échec du démarrage de la reconnaissance traduite.");
                    recognizer.close();
                    translationRecognizerRef.current = null;
                    stopRecognition();
                }
            );
        } catch (err) {
            console.error("Erreur lors de startRecognition:", err);
            setError("Une erreur inattendue s'est produite lors de la reconnaissance.");
            setIsRecognizing(false);
        }
    };

    // Stop Recognition Function
    const stopRecognition = async () => {
        if (stopInProgressRef.current) {
            // Prevent concurrent stop operations
            return;
        }

        stopInProgressRef.current = true;
        try {
            const stopPromises: Promise<void>[] = [];

            // Stop translation recognizer if active
            if (translationRecognizerRef.current) {
                const translationStopPromise = new Promise<void>((resolve) => {
                    translationRecognizerRef.current?.stopContinuousRecognitionAsync(
                        () => {
                            try {
                                translationRecognizerRef.current?.close();
                                console.log("Translation recognizer arrêté");
                            } catch (error) {
                                console.warn("Erreur lors de la fermeture du translation recognizer:", error);
                            }
                            translationRecognizerRef.current = null;
                            resolve();
                        },
                        (err) => {
                            console.error("Erreur lors de l'arrêt du translation recognizer:", err);
                            setError("Échec de l'arrêt du translation recognizer.");
                            try {
                                translationRecognizerRef.current?.close();
                            } catch (error) {
                                console.warn("Erreur lors de la fermeture du translation recognizer après échec:", error);
                            }
                            translationRecognizerRef.current = null;
                            resolve(); // Resolve even on error
                        }
                    );
                });
                stopPromises.push(translationStopPromise);
            }

            // Wait for all stop operations to complete
            await Promise.all(stopPromises);

            // Stop and close synthesizer exclusively here
            if (synthRef.current) {
                try {
                    synthRef.current.close();
                    console.log("Synthétiseur arrêté");
                } catch (error) {
                    console.warn("Synthétiseur déjà fermé:", error);
                }
                synthRef.current = null;
                setIsSynthesizing(false);
            }

            setIsRecognizing(false);
        } catch (err) {
            console.error("Erreur lors de stopRecognition:", err);
            setError("Une erreur inattendue s'est produite lors de l'arrêt.");
            setIsRecognizing(false);
        } finally {
            stopInProgressRef.current = false;
        }
    };

    // Synthesize Speech Function with adjustable speed
    const synthesizeSpeech = (text: string, speed: number) => {
        if (isSynthesizing) {
            console.warn("Synthétisation déjà en cours.");
            return;
        }

        setIsSynthesizing(true);
        try {
            console.log(`Synthétisation du discours pour le texte: "${text}" à une vitesse de: ${speed}x`);

            const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(speechKey, serviceRegion);
            const synthesisLanguage = getLocaleCode(targetLanguage); // Ensure locale code matches the voice
            speechConfig.speechSynthesisLanguage = synthesisLanguage;
            speechConfig.speechSynthesisVoiceName = voiceMap[targetLanguage] || "en-US-JennyNeural";

            const audioConfig = SpeechSDK.AudioConfig.fromDefaultSpeakerOutput();
            // Instantiate a new SpeechSynthesizer
            const synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig, audioConfig);

            // Close any existing synthesizer before assigning a new one
            if (synthRef.current) {
                console.log("Fermeture du synthétiseur existant.");
                try {
                    synthRef.current.close();
                    console.log("Synthétiseur existant fermé.");
                } catch (error) {
                    console.warn("Erreur lors de la fermeture du synthétiseur existant:", error);
                }
            }

            // Calculate prosody rate based on user-selected speed
            const prosodyRate = `${(speed * 100).toFixed(0)}%`; // e.g., 1.5x => "150%"
            console.log(`SSML Prosody Rate: ${prosodyRate}`);

            const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${synthesisLanguage}">
    <voice name="${speechConfig.speechSynthesisVoiceName}">
        <prosody rate="${prosodyRate}">${text}</prosody>
    </voice>
</speak>`.trim();
            console.log("SSML used:", ssml);

            synthesizer.speakSsmlAsync(
                ssml,
                (result) => {
                    if (result) {
                        console.log("Synthétisation réussie:", result);
                        // Only close if this synthesizer is still the current one
                        if (synthRef.current === synthesizer) {
                            synthesizer.close();
                            synthRef.current = null;
                        }
                    }
                    setIsSynthesizing(false);
                },
                (error) => {
                    console.error("Erreur lors de la synthétisation:", error);
                    setError("Une erreur s'est produite lors de la synthétisation vocale.");
                    // Only close if this synthesizer is still the current one
                    if (synthRef.current === synthesizer) {
                        synthesizer.close();
                        synthRef.current = null;
                    }
                    setIsSynthesizing(false);
                }
            );

            synthRef.current = synthesizer;
        } catch (err) {
            console.error("Erreur lors de synthesizeSpeech:", err);
            setError("Une erreur inattendue s'est produite lors de la synthétisation vocale.");
            setIsSynthesizing(false);
        }
    };

    // Function to get locale code based on language code
    const getLocaleCode = (langCode: string): string => {
        const localeMap: { [key: string]: string } = {
            pl: "pl-PL",
            en: "en-US",
            fr: "fr-FR",
            es: "es-ES", // Ensure this matches the updated voiceMap
            de: "de-DE",
            it: "it-IT",
            zh: "zh-CN",
            ko: "ko-KR",
            ar: "ar-SA",
            pt: "pt-PT",
            ru: "ru-RU",
            uk: "uk-UA",
            // Add more mappings as needed
        };
        return localeMap[langCode] || "en-US";
    };

    // Handle Target Language Change
    const handleTargetLanguageChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newTargetLanguage = e.target.value;

        if (newTargetLanguage === targetLanguage) return; // No change

        console.log(`Langue cible changée en ${newTargetLanguage}.`);

        setTargetLanguage(newTargetLanguage);

        if (isRecognizing && translationRecognizerRef.current) {
            // Restart translation recognizer with the new target language
            console.log(`Redémarrage du reconnaisseur en raison du changement de langue cible en ${newTargetLanguage}.`);
            await stopRecognition();
            startRecognition();
        }
    };

    // Handle Source Language Change
    const handleSourceLanguageChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newSourceLanguage = e.target.value;
        console.log(`Langue source changée en ${newSourceLanguage}.`);
        setSourceLanguage(newSourceLanguage);

        // If recognition is in progress, restart it with the new source language
        if (isRecognizing) {
            await stopRecognition();
            startRecognition();
        }
    };

    // Handle Audio Input Device Change
    const handleAudioInputDeviceChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newDeviceId = e.target.value;
        console.log(`Périphérique d'entrée audio changé en: ${newDeviceId}`);
        setSelectedAudioInputDevice(newDeviceId);

        if (isRecognizing) {
            console.log(`Redémarrage de la reconnaissance en raison du changement de périphérique audio en ${newDeviceId}.`);
            await stopRecognition();
            startRecognition();
        }
    };

    // Download Session Transcription Function
    const downloadSessionTranscription = () => {
        if (!sessionTranscription) {
            setError("Aucune transcription disponible à télécharger.");
            return;
        }

        const element = document.createElement("a");
        const file = new Blob([sessionTranscription], { type: "text/plain" });
        element.href = URL.createObjectURL(file);
        element.download = "session_transcription.txt";
        document.body.appendChild(element); // Required for this to work in Firefox
        element.click();
        document.body.removeChild(element);
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-gray-100 to-white text-gray-900 font-roboto">
            {/* Navigation Bar */}
            <header className="fixed top-0 w-full bg-white shadow-sm z-50">
                <nav className="max-w-screen-xl mx-auto flex justify-between items-center px-6 py-4">
                    <div className="flex items-center space-x-3">
                        <img src={logo} alt="App Logo" className="h-8 w-auto object-contain" />
                        <span className="text-2xl font-semibold tracking-tight">
                            Traducteur IA
                        </span>
                    </div>
                    <ul className="flex space-x-6">
                        <li>
                            <a href="#features" className="text-gray-700 hover:text-gray-900 transition">
                                Fonctionnalités
                            </a>
                        </li>
                        <li>
                            <a href="#about" className="text-gray-700 hover:text-gray-900 transition">
                                À propos
                            </a>
                        </li>
                        <li>
                            <a href="#contact" className="text-gray-700 hover:text-gray-900 transition">
                                Contactez-Nous
                            </a>
                        </li>
                    </ul>
                </nav>
            </header>

            {/* Hero Section */}
            <section className="relative bg-gradient-to-r from-gray-50 via-gray-100 to-white py-24 mt-16">
                <div className="max-w-screen-lg mx-auto text-center px-6">
                    <h1 className="text-5xl md:text-7xl font-extrabold text-gray-800 leading-tight">
                        Traduction vocale en temps réel
                    </h1>
                    <p className="mt-6 text-lg md:text-xl text-gray-600 max-w-3xl mx-auto">
                        Parlez dans n'importe quelle langue, et nous la traduirons instantanément 
                        avec des voix naturelles et fluides.
                    </p>

                    {/* Container for AudioVisualizer and Buttons */}
                    <div className="mt-12 flex flex-col items-center space-y-8">
                        {/* AudioVisualizer - Only visible when recognizing */}
                        {isRecognizing && (
                            <div className="w-full flex justify-center">
                                <AudioVisualizer isRecording={isRecognizing} />
                            </div>
                        )}

                        {/* Start/Stop Button */}
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={isRecognizing ? stopRecognition : startRecognition}
                            className={`px-8 py-4 ${
                                isRecognizing ? "bg-red-600 hover:bg-red-500" : "bg-gray-900 hover:bg-gray-700"
                            } text-white text-lg font-medium rounded-full shadow-lg focus:outline-none focus:ring-4 ${
                                isRecognizing ? "focus:ring-red-300" : "focus:ring-gray-300"
                            } transition`}
                        >
                            {isRecognizing ? (
                                <>
                                    <MicOff className="w-6 h-6 mr-2 inline" />
                                    Stop
                                </>
                            ) : (
                                <>
                                    <Mic className="w-6 h-6 mr-2 inline" />
                                    Get Started
                                </>
                            )}
                        </motion.button>
                    </div>
                </div>
            </section>

            {/* Error and Success Messages */}
            <div className="max-w-screen-xl mx-auto px-6 py-4">
                {error && (
                    <div className="mb-6 p-4 bg-red-100 text-red-700 rounded-lg shadow flex items-center space-x-2 animate-fadeIn">
                        <X className="w-6 h-6" />
                        <span>{error}</span>
                    </div>
                )}

                {successMessage && (
                    <div className="mb-6 p-4 bg-green-100 text-green-700 rounded-lg shadow flex items-center space-x-2 animate-fadeIn">
                        <Check className="w-6 h-6" />
                        <span>{successMessage}</span>
                    </div>
                )}
            </div>

            {/* Device and Language Selection */}
            <section id="device-selection" className="max-w-screen-xl mx-auto py-16 px-6">
                <h2 className="text-3xl font-bold text-gray-800 text-center mb-12">
                    Configuration de la langue et de l'appareil
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Audio Input Device */}
                    <div className="p-6 bg-white shadow-md rounded-lg">
                        <h3 className="text-xl font-semibold text-gray-800 mb-4">
                            Périphérique d'entrée audio
                        </h3>
                        <select
                            value={selectedAudioInputDevice}
                            onChange={handleAudioInputDeviceChange}
                            className="w-full p-3 bg-gray-100 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                        >
                            {audioInputDevices.length > 0 ? (
                                audioInputDevices.map((device) => (
                                    <option key={device.deviceId} value={device.deviceId}>
                                        {device.label}
                                    </option>
                                ))
                            ) : (
                                <option value="">Aucun périphérique trouvé</option>
                            )}
                        </select>
                    </div>

                    {/* Source Language */}
                    <div className="p-6 bg-white shadow-md rounded-lg">
                        <h3 className="text-xl font-semibold text-gray-800 mb-4">
                            Langue source
                        </h3>
                        <select
                            value={sourceLanguage}
                            onChange={handleSourceLanguageChange}
                            className="w-full p-3 bg-gray-100 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                        >
                            {sourceLanguages.map((lang) => (
                                <option key={lang.code} value={lang.code}>
                                    <span className="flex items-center">
                                        <ReactCountryFlag
                                            countryCode={getCountryCode(lang.code)}
                                            svg
                                            style={{
                                                width: "1.5em",
                                                height: "1.5em",
                                                marginRight: "0.5em",
                                                borderRadius: "50%",
                                            }}
                                        />
                                        {lang.name}
                                    </span>
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Target Language */}
                    <div className="p-6 bg-white shadow-md rounded-lg">
                        <h3 className="text-xl font-semibold text-gray-800 mb-4">
                            Langue cible
                        </h3>
                        <select
                            value={targetLanguage}
                            onChange={handleTargetLanguageChange}
                            className="w-full p-3 bg-gray-100 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                        >
                            {targetLanguages.map((lang) => (
                                <option key={lang.code} value={lang.code}>
                                    <span className="flex items-center">
                                        <ReactCountryFlag
                                            countryCode={getCountryCode(lang.code)}
                                            svg
                                            style={{
                                                width: "1.5em",
                                                height: "1.5em",
                                                marginRight: "0.5em",
                                                borderRadius: "50%",
                                            }}
                                        />
                                        {lang.name}
                                    </span>
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </section>

            {/* Phrase List Section */}
            <section className="max-w-screen-xl mx-auto py-16 px-6">
                <h2 className="text-3xl font-bold text-gray-800 text-center mb-12">
                    Améliorez la reconnaissance avec la liste de phrases ({sourceLanguage.toUpperCase()})
                </h2>
                <div className="flex flex-col md:flex-row items-start md:items-center justify-center gap-4">
                    {/* Phrase Input */}
                    <input
                        type="text"
                        value={phraseInput}
                        onChange={(e) => setPhraseInput(e.target.value)}
                        onKeyDown={handlePhraseInputKeyDown}
                        placeholder="Entrez une phrase ou un mot et appuyez sur Entrée"
                        className="w-full md:w-auto p-3 border border-gray-300 rounded-md bg-gray-100 text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-600 transition duration-200 text-sm"
                    />
                    {/* Add Phrase Button */}
                    <button
                        onClick={handleAddPhrase}
                        className="flex items-center px-4 py-2 bg-green-500 text-white rounded-full hover:bg-green-600 transition duration-200 focus:outline-none shadow-sm text-sm"
                        aria-label="Add Phrase"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Ajouter
                    </button>
                    {/* Clear Phrases Button */}
                    <button
                        onClick={handleClearPhrases}
                        className={`flex items-center px-4 py-2 bg-gray-700 text-white rounded-full hover:bg-gray-800 transition duration-200 focus:outline-none shadow-sm text-sm ${
                            (phraseList[sourceLanguage]?.length || 0) === 0
                                ? "opacity-50 cursor-not-allowed"
                                : ""
                        }`}
                        disabled={(phraseList[sourceLanguage]?.length || 0) === 0}
                        aria-label="Clear Phrases"
                    >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Effacer
                    </button>
                </div>

                {/* Predefined Scientific Terms */}
                {predefinedScientificTerms[sourceLanguage]?.length > 0 && (
                    <div className="mt-8">
                        <h3 className="text-lg font-medium text-gray-700 mb-4 text-center">
                            Termes scientifiques prédéfinis:
                        </h3>
                        <div className="flex flex-wrap justify-center gap-3">
                            {predefinedScientificTerms[sourceLanguage].map((term, index) => (
                                <button
                                    key={index}
                                    onClick={() => handleAddPredefinedPhrase(term)}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition duration-200 text-sm"
                                    aria-label={`Add predefined phrase ${term}`}
                                >
                                    {term}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Display Current Language's Phrase List */}
                {(phraseList[sourceLanguage]?.length || 0) > 0 && (
                    <div className="mt-8">
                        <h3 className="text-lg font-medium text-gray-700 mb-4 text-center">
                            Phrases actuelles:
                        </h3>
                        <div className="h-32 overflow-y-auto p-4 bg-gray-100 border border-gray-300 rounded-md shadow-inner">
                            <ul className="space-y-2">
                                {phraseList[sourceLanguage].map((phrase, index) => (
                                    <li key={index} className="flex items-center justify-between">
                                        <span className="text-sm text-gray-800">{phrase}</span>
                                        <button
                                            onClick={() => handleRemovePhrase(phrase)}
                                            className="text-red-500 hover:text-red-700 transition duration-200 focus:outline-none"
                                            aria-label={`Remove phrase ${phrase}`}
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}
            </section>

            {/* Audio Playback Speed Control */}
            <section className="max-w-screen-xl mx-auto py-16 px-6">
                <div className="flex flex-col items-center">
                    <label htmlFor="playback-speed" className="block text-gray-700 font-medium mb-2">
                        Ajuster la vitesse de lecture audio : {playbackSpeed.toFixed(1)}x
                    </label>
                    <input
                        type="range"
                        id="playback-speed"
                        min="0.5"
                        max="2.0"
                        step="0.1"
                        value={playbackSpeed}
                        onChange={(e) => {
                            const newSpeed = parseFloat(e.target.value);
                            console.log(`Mise à jour de la vitesse de lecture à : ${newSpeed}x`);
                            setPlaybackSpeed(newSpeed);
                        }}
                        className="w-full max-w-md"
                    />
                </div>
            </section>

            {/* Transcription and Translation Display */}
            {showTranscriptionSections && (
                <section className="max-w-screen-xl mx-auto py-16 px-6">
                    <h2 className="text-3xl font-bold text-gray-800 text-center mb-12">
                        Transcription et Traduction
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Transcription Box */}
                        <div className="p-6 bg-white shadow-md rounded-lg">
                            <h3 className="text-xl font-semibold text-gray-800 mb-4">Transcription</h3>
                            <div className="p-4 bg-gray-100 rounded-md min-h-[150px]">
                                <p className="text-gray-700 whitespace-pre-wrap">
                                    {transcription || "La transcription apparaîtra ici..."}
                                </p>
                            </div>
                        </div>

                        {/* Translation Box */}
                        <div className="p-6 bg-white shadow-md rounded-lg">
                            <h3 className="text-xl font-semibold text-gray-800 mb-4">Traduction</h3>
                            <div className="p-4 bg-gray-100 rounded-md min-h-[150px]">
                                <p className="text-gray-700 whitespace-pre-wrap">
                                    {translation || "La traduction apparaîtra ici..."}
                                </p>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* Session Transcription and Download */}
            {showTranscriptionSections && (
                <section className="max-w-screen-xl mx-auto py-16 px-6">
                    <h2 className="text-3xl font-bold text-gray-800 text-center mb-8">
                        Transcription de la session
                    </h2>
                    <div className="p-6 bg-gray-100 rounded-lg shadow-md min-h-[200px] overflow-y-auto">
                        <pre className="text-gray-800 whitespace-pre-wrap">
                            {sessionTranscription || "La transcription de la session apparaîtra ici..."}
                        </pre>
                    </div>
                    <div className="mt-6 flex justify-center">
                        <button
                            onClick={downloadSessionTranscription}
                            className={`flex items-center justify-center px-6 py-3 bg-purple-600 text-white rounded-full hover:bg-purple-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-lg transform hover:scale-105 ${
                                !sessionTranscription ? "bg-purple-300 cursor-not-allowed" : ""
                            }`}
                            disabled={!sessionTranscription}
                        >
                            <Download className="w-5 h-5 mr-2" />
                            Télécharger la transcription
                        </button>
                    </div>
                </section>
            )}

            {/* Footer */}
            <footer className="bg-gray-900 text-white py-6 mt-16">
                <div className="max-w-screen-xl mx-auto text-center">
                    <p className="text-sm">
                        &copy; 2025 Traducteur IA. Tous droits réservés.
                    </p>
                </div>
            </footer>
        </div>
    );

}

export default App;
