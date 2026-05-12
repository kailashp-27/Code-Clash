#!/bin/bash
# Fix for cgroup v2 hosts (Docker Desktop WSL2)
# Judge0's isolate sandbox requires cgroup v1 mount points.
# This script wraps isolate to strip --cg arguments, allowing it to run without cgroups.

echo "[cgroup-fix] Disabling cgroup requirements for isolate..."

if [ ! -f /usr/local/bin/isolate.real ]; then
    sudo mv /usr/local/bin/isolate /usr/local/bin/isolate.real
    
    cat << 'EOF' | sudo tee /usr/local/bin/isolate > /dev/null
#!/bin/bash
args=()
for arg in "$@"; do
    if [[ "$arg" != --cg* ]]; then
        args+=("$arg")
    fi
done
exec /usr/local/bin/isolate.real "${args[@]}"
EOF

    sudo chmod +x /usr/local/bin/isolate
    echo "[cgroup-fix] isolate wrapper installed successfully!"
fi

# Execute the original command
exec "$@"
