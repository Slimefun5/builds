git config user.name "Slimefun5 Builder"
git config user.email ${LOGIN_EMAIL}

git config --unset-all http.https://github.com/.extraheader || true
git remote set-url origin https://x-access-token:${ACCESS_TOKEN}@github.com/Slimefun5/builds.git
