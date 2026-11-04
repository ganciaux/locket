// Outil autonome de lecture d'une sauvegarde : un seul fichier .html, hors ligne, sans Stash ni Firebase.
import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

mount(App, { target: document.getElementById('app')! });
