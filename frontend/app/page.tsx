'use client';

import { useEffect, useMemo, useState } from 'react';

type Device = {
  device_id: number;
  device_name: string;
  dry_raw: number;
  wet_raw: number;
  active_yn: string;
  created_at: string;
  updated_at: string;
};

type Reading = {
  id: number;
  device_id: number;
  device_name: string;
  dry_raw: number;
  wet_raw: number;
  moisture_raw: number;
  moisture_percent: number | null;
  battery_voltage: number | null;
  battery_percent: number | null;
  created_at: string;
};

type ApiListResponse<T> = {
  status: string;
  data: T[];
};

type ApiSingleResponse<T> = {
  status: string;
  message?: string;
  data: T;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://192.168.86.35:8000';

const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || 'my-secret-token';

function formatValue(value: number | null | undefined, suffix = '') {
  if (value === null || value === undefined) return 'N/A';
  return `${value}${suffix}`;
}

export default function Home() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);

  const [selectedDeviceId, setSelectedDeviceId] = useState<number>(1);
  const [deviceName, setDeviceName] = useState('');
  const [dryRaw, setDryRaw] = useState('');
  const [wetRaw, setWetRaw] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const latest = readings[0];

  const selectedDevice = useMemo(() => {
    return devices.find((d) => d.device_id === selectedDeviceId);
  }, [devices, selectedDeviceId]);

  const batteryStatus = useMemo(() => {
    if (!latest?.battery_percent && latest?.battery_percent !== 0) {
      return 'Unknown';
    }

    if (latest.battery_percent >= 70) return 'Good';
    if (latest.battery_percent >= 35) return 'Medium';
    return 'Low';
  }, [latest]);

  async function loadAll() {
    try {
      setError('');
      setMessage('');

      const devicesRes = await fetch(`${API_BASE_URL}/api/devices`, {
        cache: 'no-store',
      });

      const readingsRes = await fetch(
        `${API_BASE_URL}/api/moisture/latest?limit=50`,
        {
          cache: 'no-store',
        }
      );

      if (!devicesRes.ok) {
        throw new Error(`Devices API returned HTTP ${devicesRes.status}`);
      }

      if (!readingsRes.ok) {
        throw new Error(`Readings API returned HTTP ${readingsRes.status}`);
      }

      const devicesJson: ApiListResponse<Device> = await devicesRes.json();
      const readingsJson: ApiListResponse<Reading> = await readingsRes.json();

      if (devicesJson.status !== 'success') {
        throw new Error('Devices API returned error');
      }

      if (readingsJson.status !== 'success') {
        throw new Error('Readings API returned error');
      }

      setDevices(devicesJson.data);
      setReadings(readingsJson.data);

      if (devicesJson.data.length > 0) {
        const current =
          devicesJson.data.find((d) => d.device_id === selectedDeviceId) ||
          devicesJson.data[0];

        setSelectedDeviceId(current.device_id);
        setDeviceName(current.device_name);
        setDryRaw(String(current.dry_raw));
        setWetRaw(String(current.wet_raw));
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  }

  async function saveCalibration() {
    try {
      setSaving(true);
      setError('');
      setMessage('');

      const dry = Number(dryRaw);
      const wet = Number(wetRaw);

      if (!Number.isFinite(dry)) {
        throw new Error('Dry Raw must be a number');
      }

      if (!Number.isFinite(wet)) {
        throw new Error('Wet Raw must be a number');
      }

      if (!deviceName.trim()) {
        throw new Error('Device Name is required');
      }

      const res = await fetch(`${API_BASE_URL}/api/devices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Token': API_TOKEN,
        },
        body: JSON.stringify({
          device_id: selectedDeviceId,
          device_name: deviceName.trim(),
          dry_raw: dry,
          wet_raw: wet,
          active_yn: 'Y',
        }),
      });

      const json: ApiSingleResponse<Device> = await res.json();

      if (!res.ok) {
        throw new Error(json.message || `Save failed with HTTP ${res.status}`);
      }

      setMessage('Calibration saved successfully');
      await loadAll();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errMsg);
    } finally {
      setSaving(false);
    }
  }

  function setLatestAsDry() {
    if (!latest) {
      setError('No latest reading available');
      return;
    }

    setDryRaw(String(latest.moisture_raw));
    setMessage(`Dry Raw set to latest raw value: ${latest.moisture_raw}`);
  }

  function setLatestAsWet() {
    if (!latest) {
      setError('No latest reading available');
      return;
    }

    setWetRaw(String(latest.moisture_raw));
    setMessage(`Wet Raw set to latest raw value: ${latest.moisture_raw}`);
  }

  function handleDeviceChange(deviceIdText: string) {
    const deviceId = Number(deviceIdText);
    setSelectedDeviceId(deviceId);

    const device = devices.find((d) => d.device_id === deviceId);

    if (device) {
      setDeviceName(device.device_name);
      setDryRaw(String(device.dry_raw));
      setWetRaw(String(device.wet_raw));
    }
  }

  useEffect(() => {
    loadAll();

    const timer = setInterval(() => {
      loadAll();
    }, 30000);

    return () => clearInterval(timer);
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Moisture Sensor Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Backend: {API_BASE_URL}
            </p>
          </div>

          <button
            onClick={loadAll}
            className="rounded-lg bg-sky-500 px-4 py-2 font-semibold text-slate-950 hover:bg-sky-400"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/40 bg-red-950/50 p-4 text-red-200">
            <div className="font-semibold">Error</div>
            <div className="mt-1 text-sm">{error}</div>
          </div>
        )}

        {message && (
          <div className="mb-6 rounded-xl border border-green-500/40 bg-green-950/40 p-4 text-green-200">
            {message}
          </div>
        )}

        {loading && (
          <div className="rounded-xl bg-slate-900 p-4 text-slate-300">
            Loading moisture data...
          </div>
        )}

        {!loading && (
          <>
            <section className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <MetricCard
                label="Device ID"
                value={latest ? String(latest.device_id) : 'N/A'}
              />
              <MetricCard
                label="Moisture Raw"
                value={latest ? String(latest.moisture_raw) : 'N/A'}
              />
              <MetricCard
                label="Moisture"
                value={
                  latest ? formatValue(latest.moisture_percent, '%') : 'N/A'
                }
              />
              <MetricCard
                label="Battery"
                value={
                  latest ? formatValue(latest.battery_percent, '%') : 'N/A'
                }
                subValue={
                  latest
                    ? `${formatValue(
                        latest.battery_voltage,
                        'V'
                      )} / ${batteryStatus}`
                    : undefined
                }
              />
              <MetricCard
                label="Last Update"
                value={latest ? latest.created_at : 'N/A'}
                small
              />
            </section>

            <section className="mb-6 grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl bg-slate-900 p-4 shadow-xl lg:col-span-1">
                <h2 className="mb-4 text-xl font-semibold">
                  Device Calibration
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm text-slate-400">
                      Device
                    </label>

                    <select
                      value={selectedDeviceId}
                      onChange={(e) => handleDeviceChange(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                    >
                      {devices.map((device) => (
                        <option
                          key={device.device_id}
                          value={device.device_id}
                        >
                          {device.device_id} - {device.device_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm text-slate-400">
                      Device Name
                    </label>
                    <input
                      value={deviceName}
                      onChange={(e) => setDeviceName(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm text-slate-400">
                      Dry Raw
                    </label>
                    <input
                      value={dryRaw}
                      onChange={(e) => setDryRaw(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm text-slate-400">
                      Wet Raw
                    </label>
                    <input
                      value={wetRaw}
                      onChange={(e) => setWetRaw(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                    />
                  </div>

                  <div className="grid gap-2">
                    <button
                      onClick={setLatestAsDry}
                      className="rounded-lg bg-amber-500 px-4 py-2 font-semibold text-slate-950 hover:bg-amber-400"
                    >
                      Set Latest Raw as Dry
                    </button>

                    <button
                      onClick={setLatestAsWet}
                      className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950 hover:bg-emerald-400"
                    >
                      Set Latest Raw as Wet
                    </button>

                    <button
                      onClick={saveCalibration}
                      disabled={saving}
                      className="rounded-lg bg-sky-500 px-4 py-2 font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save Calibration'}
                    </button>
                  </div>

                  <div className="rounded-lg bg-slate-950 p-3 text-sm text-slate-400">
                    <div>Formula used by backend:</div>
                    <div className="mt-1 font-mono text-slate-300">
                      ((dry_raw - moisture_raw) / (dry_raw - wet_raw)) × 100
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-slate-900 p-4 shadow-xl lg:col-span-2">
                <h2 className="mb-4 text-xl font-semibold">Devices</h2>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-700 text-left text-sky-300">
                        <th className="px-3 py-2">Device</th>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Dry Raw</th>
                        <th className="px-3 py-2">Wet Raw</th>
                        <th className="px-3 py-2">Active</th>
                        <th className="px-3 py-2">Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {devices.map((device) => (
                        <tr
                          key={device.device_id}
                          className="border-b border-slate-800 hover:bg-slate-800/70"
                        >
                          <td className="px-3 py-2">{device.device_id}</td>
                          <td className="px-3 py-2">{device.device_name}</td>
                          <td className="px-3 py-2">{device.dry_raw}</td>
                          <td className="px-3 py-2">{device.wet_raw}</td>
                          <td className="px-3 py-2">{device.active_yn}</td>
                          <td className="px-3 py-2">{device.updated_at}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {!selectedDevice && (
                  <div className="mt-4 rounded-lg bg-slate-950 p-3 text-sm text-slate-400">
                    No device selected.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl bg-slate-900 p-4 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Recent Readings</h2>
                <span className="text-sm text-slate-400">
                  Showing {readings.length} rows
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-left text-sky-300">
                      <th className="px-3 py-2">Time</th>
                      <th className="px-3 py-2">Device</th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Raw</th>
                      <th className="px-3 py-2">Moisture %</th>
                      <th className="px-3 py-2">Battery V</th>
                      <th className="px-3 py-2">Battery %</th>
                      <th className="px-3 py-2">Dry Raw</th>
                      <th className="px-3 py-2">Wet Raw</th>
                    </tr>
                  </thead>

                  <tbody>
                    {readings.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-slate-800 hover:bg-slate-800/70"
                      >
                        <td className="px-3 py-2">{row.created_at}</td>
                        <td className="px-3 py-2">{row.device_id}</td>
                        <td className="px-3 py-2">{row.device_name}</td>
                        <td className="px-3 py-2">{row.moisture_raw}</td>
                        <td className="px-3 py-2">{row.moisture_percent}</td>
                        <td className="px-3 py-2">{row.battery_voltage}</td>
                        <td className="px-3 py-2">{row.battery_percent}</td>
                        <td className="px-3 py-2">{row.dry_raw}</td>
                        <td className="px-3 py-2">{row.wet_raw}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  subValue,
  small = false,
}: {
  label: string;
  value: string;
  subValue?: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-slate-900 p-4 shadow-xl">
      <div className="text-sm text-slate-400">{label}</div>
      <div
        className={
          small
            ? 'mt-3 text-lg font-bold text-white'
            : 'mt-3 text-3xl font-bold text-white'
        }
      >
        {value}
      </div>
      {subValue && (
        <div className="mt-2 text-sm text-slate-400">{subValue}</div>
      )}
    </div>
  );
}