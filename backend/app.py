from flask import Flask, request, jsonify
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor
from decimal import Decimal
from datetime import datetime
import os

app = Flask(__name__)
CORS(app)

API_TOKEN = os.getenv("API_TOKEN", "my-secret-token")

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "192.168.86.35"),
    "port": int(os.getenv("DB_PORT", "5432")),
    "dbname": os.getenv("DB_NAME", "HomeControlDB"),
    "user": os.getenv("DB_USER", "tuan11ps"),
    "password": os.getenv("DB_PASSWORD", "home!control1989"),
}


def json_safe(value):
    if isinstance(value, Decimal):
        return float(value)

    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")

    return value


def row_to_dict(row):
    return {key: json_safe(value) for key, value in dict(row).items()}


def get_conn():
    return psycopg2.connect(**DB_CONFIG)


def calculate_moisture_percent(dry_raw, wet_raw, moisture_raw):
    """
    Most capacitive soil moisture sensors:
    - dry_raw is higher
    - wet_raw is lower

    Formula:
    ((dry_raw - moisture_raw) / (dry_raw - wet_raw)) * 100
    """

    if dry_raw is None or wet_raw is None or moisture_raw is None:
        return None

    if dry_raw == wet_raw:
        return None

    percent = ((dry_raw - moisture_raw) / (dry_raw - wet_raw)) * 100

    if percent < 0:
        percent = 0

    if percent > 100:
        percent = 100

    return round(percent, 2)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "service": "moisture-backend"
    })


# ==========================================================
# DEVICE / CALIBRATION API
# ==========================================================

@app.route("/api/devices", methods=["GET"])
def get_devices():
    sql = """
    SELECT
        device_id,
        device_name,
        dry_raw,
        wet_raw,
        active_yn,
        created_at,
        updated_at
    FROM moisture_devices
    ORDER BY device_id;
    """

    with get_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql)
            rows = cur.fetchall()

    return jsonify({
        "status": "success",
        "data": [row_to_dict(row) for row in rows]
    })


@app.route("/api/devices/<int:device_id>", methods=["GET"])
def get_device(device_id):
    sql = """
    SELECT
        device_id,
        device_name,
        dry_raw,
        wet_raw,
        active_yn,
        created_at,
        updated_at
    FROM moisture_devices
    WHERE device_id = %s;
    """

    with get_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, (device_id,))
            row = cur.fetchone()

    if not row:
        return jsonify({
            "status": "error",
            "message": "Device not found"
        }), 404

    return jsonify({
        "status": "success",
        "data": row_to_dict(row)
    })


@app.route("/api/devices", methods=["POST"])
def create_or_update_device():
    token = request.headers.get("X-API-Token")

    if token != API_TOKEN:
        return jsonify({
            "status": "error",
            "message": "Invalid token"
        }), 401

    data = request.get_json(force=True)

    device_id = data.get("device_id")
    device_name = data.get("device_name")
    dry_raw = data.get("dry_raw")
    wet_raw = data.get("wet_raw")
    active_yn = data.get("active_yn", "Y")

    if device_id is None:
        return jsonify({
            "status": "error",
            "message": "device_id is required"
        }), 400

    if not device_name:
        return jsonify({
            "status": "error",
            "message": "device_name is required"
        }), 400

    if dry_raw is None:
        return jsonify({
            "status": "error",
            "message": "dry_raw is required"
        }), 400

    if wet_raw is None:
        return jsonify({
            "status": "error",
            "message": "wet_raw is required"
        }), 400

    sql = """
    INSERT INTO moisture_devices
        (device_id, device_name, dry_raw, wet_raw, active_yn)
    VALUES
        (%s, %s, %s, %s, %s)
    ON CONFLICT (device_id)
    DO UPDATE SET
        device_name = EXCLUDED.device_name,
        dry_raw = EXCLUDED.dry_raw,
        wet_raw = EXCLUDED.wet_raw,
        active_yn = EXCLUDED.active_yn,
        updated_at = NOW()
    RETURNING
        device_id,
        device_name,
        dry_raw,
        wet_raw,
        active_yn,
        created_at,
        updated_at;
    """

    with get_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, (
                device_id,
                device_name,
                dry_raw,
                wet_raw,
                active_yn
            ))
            row = cur.fetchone()

    return jsonify({
        "status": "success",
        "message": "Device saved",
        "data": row_to_dict(row)
    })


@app.route("/api/devices/<int:device_id>/calibration", methods=["PUT"])
def update_device_calibration(device_id):
    token = request.headers.get("X-API-Token")

    if token != API_TOKEN:
        return jsonify({
            "status": "error",
            "message": "Invalid token"
        }), 401

    data = request.get_json(force=True)

    dry_raw = data.get("dry_raw")
    wet_raw = data.get("wet_raw")

    if dry_raw is None and wet_raw is None:
        return jsonify({
            "status": "error",
            "message": "dry_raw or wet_raw is required"
        }), 400

    updates = []
    params = []

    if dry_raw is not None:
        updates.append("dry_raw = %s")
        params.append(dry_raw)

    if wet_raw is not None:
        updates.append("wet_raw = %s")
        params.append(wet_raw)

    updates.append("updated_at = NOW()")
    params.append(device_id)

    sql = f"""
    UPDATE moisture_devices
    SET {", ".join(updates)}
    WHERE device_id = %s
    RETURNING
        device_id,
        device_name,
        dry_raw,
        wet_raw,
        active_yn,
        created_at,
        updated_at;
    """

    with get_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, tuple(params))
            row = cur.fetchone()

    if not row:
        return jsonify({
            "status": "error",
            "message": "Device not found"
        }), 404

    return jsonify({
        "status": "success",
        "message": "Calibration updated",
        "data": row_to_dict(row)
    })


# ==========================================================
# MOISTURE READING API
# ==========================================================

@app.route("/api/moisture", methods=["POST"])
def insert_moisture():
    token = request.headers.get("X-API-Token")

    if token != API_TOKEN:
        return jsonify({
            "status": "error",
            "message": "Invalid token"
        }), 401

    data = request.get_json(force=True)

    device_id = data.get("device_id")
    moisture_raw = data.get("moisture_raw")
    battery_voltage = data.get("battery_voltage")
    battery_percent = data.get("battery_percent")

    if device_id is None:
        return jsonify({
            "status": "error",
            "message": "device_id is required"
        }), 400

    if moisture_raw is None:
        return jsonify({
            "status": "error",
            "message": "moisture_raw is required"
        }), 400

    with get_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT
                    dry_raw,
                    wet_raw
                FROM moisture_devices
                WHERE device_id = %s
                  AND active_yn = 'Y';
            """, (device_id,))

            device = cur.fetchone()

            if not device:
                return jsonify({
                    "status": "error",
                    "message": "Device not found or inactive"
                }), 404

            moisture_percent = calculate_moisture_percent(
                dry_raw=device["dry_raw"],
                wet_raw=device["wet_raw"],
                moisture_raw=moisture_raw
            )

            cur.execute("""
                INSERT INTO moisture_sensor_readings
                    (
                        device_id,
                        moisture_raw,
                        moisture_percent,
                        battery_voltage,
                        battery_percent
                    )
                VALUES
                    (%s, %s, %s, %s, %s)
                RETURNING
                    id,
                    device_id,
                    moisture_raw,
                    moisture_percent,
                    battery_voltage,
                    battery_percent,
                    created_at;
            """, (
                device_id,
                moisture_raw,
                moisture_percent,
                battery_voltage,
                battery_percent
            ))

            row = cur.fetchone()

    return jsonify({
        "status": "success",
        "message": "Moisture data saved",
        "data": row_to_dict(row)
    })


@app.route("/api/moisture/latest", methods=["GET"])
def latest_moisture():
    limit = request.args.get("limit", default=20, type=int)

    if limit < 1:
        limit = 20

    if limit > 200:
        limit = 200

    sql = """
    SELECT
        r.id,
        r.device_id,
        d.device_name,
        d.dry_raw,
        d.wet_raw,
        r.moisture_raw,
        r.moisture_percent,
        r.battery_voltage,
        r.battery_percent,
        r.created_at
    FROM moisture_sensor_readings r
    JOIN moisture_devices d
      ON r.device_id = d.device_id
    ORDER BY r.created_at DESC
    LIMIT %s;
    """

    with get_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, (limit,))
            rows = cur.fetchall()

    return jsonify({
        "status": "success",
        "data": [row_to_dict(row) for row in rows]
    })


@app.route("/api/moisture/device/<int:device_id>", methods=["GET"])
def moisture_by_device(device_id):
    limit = request.args.get("limit", default=100, type=int)

    if limit < 1:
        limit = 100

    if limit > 500:
        limit = 500

    sql = """
    SELECT
        r.id,
        r.device_id,
        d.device_name,
        d.dry_raw,
        d.wet_raw,
        r.moisture_raw,
        r.moisture_percent,
        r.battery_voltage,
        r.battery_percent,
        r.created_at
    FROM moisture_sensor_readings r
    JOIN moisture_devices d
      ON r.device_id = d.device_id
    WHERE r.device_id = %s
    ORDER BY r.created_at DESC
    LIMIT %s;
    """

    with get_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, (device_id, limit))
            rows = cur.fetchall()

    return jsonify({
        "status": "success",
        "device_id": device_id,
        "data": [row_to_dict(row) for row in rows]
    })


@app.route("/api/moisture/summary", methods=["GET"])
def moisture_summary():
    sql = """
    SELECT
        d.device_id,
        d.device_name,
        d.dry_raw,
        d.wet_raw,
        d.active_yn,
        COUNT(r.id) AS total_readings,
        MAX(r.created_at) AS last_seen,
        AVG(r.moisture_percent) AS avg_moisture_percent,
        AVG(r.battery_percent) AS avg_battery_percent
    FROM moisture_devices d
    LEFT JOIN moisture_sensor_readings r
      ON d.device_id = r.device_id
    GROUP BY
        d.device_id,
        d.device_name,
        d.dry_raw,
        d.wet_raw,
        d.active_yn
    ORDER BY d.device_id;
    """

    with get_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql)
            rows = cur.fetchall()

    return jsonify({
        "status": "success",
        "data": [row_to_dict(row) for row in rows]
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)