#!/bin/sh
# Derive the live-status booleans before nginx's envsubst renders the
# template (runs in lexical order, ahead of 20-envsubst-on-templates.sh).
export FLOWTWIN_GEMINI_KEY="${FLOWTWIN_GEMINI_KEY:-}"
export FLOWTWIN_NVIDIA_KEY="${FLOWTWIN_NVIDIA_KEY:-}"
export FLOWTWIN_GEMINI_ON=$([ -n "$FLOWTWIN_GEMINI_KEY" ] && echo true || echo false)
export FLOWTWIN_NVIDIA_ON=$([ -n "$FLOWTWIN_NVIDIA_KEY" ] && echo true || echo false)
