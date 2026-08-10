@echo off
set PYTHONIOENCODING=utf-8
cd /d "C:\Users\jin-1\Project\ddemachim\data-pipeline"
"C:\Users\jin-1\AppData\Local\Python\pythoncore-3.14-64\python.exe" scripts\run_seoul_culture_event.py >> "C:\Users\jin-1\Project\ddemachim\data-pipeline\data\processed\run_seoul_culture_event_weekly.log" 2>&1
