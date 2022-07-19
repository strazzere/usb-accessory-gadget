import { log } from "./logger"

const debug = false
// eslint-disable-next-line @typescript-eslint/ban-types
let threadObj: Java.Wrapper<{}>
let accessoryFD: number

if(Java.available) {
  if (debug) {
    log('Java was available, attempting to create a thread and hook methods...')
    Java.perform(() => {
      const ThreadDef = Java.use('java.lang.Thread')
      threadObj = ThreadDef.$new()
    })
  }

  Java.perform(() => {
    const usbManager = Java.use('android.hardware.usb.UsbManager')
    usbManager.openAccessory.overload('android.hardware.usb.UsbAccessory').implementation = (usbAccessory: NativePointerValue) => {
      if (debug) {
        log(`usbManager.openAccessory(android.hardware.usb.UsbAccessory) called`)
        stackTraceOutsideJava()
      }
      const ret = usbManager.openAccessory.call(this, usbAccessory)
      const parcelFileDescriptor = Java.cast(ret, Java.use('android.os.ParcelFileDescriptor'))
      
      log(`***** usb accessory FD : ${parcelFileDescriptor} ${parcelFileDescriptor.getFd()}`)
      accessoryFD = parcelFileDescriptor.getFd()
      return parcelFileDescriptor
    };
  })
} else {
  console.log('Java not available - unable to set classloader, very likely everything else will fail')
}

function stackTraceOutsideJava() {
  if (threadObj != null) {
    const stack = threadObj.currentThread().getStackTrace()
    for (let i = 0; i < stack.length; i++) {
      log(i + " => " + stack[i].toString())
    }
    log('--------------------------------------------------------------------------')
  } else {
    log('****** Skipping stacktrace - no java threadObj.')
  }
}

const libcWrite = Module.findExportByName('libc.so', 'write')
if (libcWrite) {
  Interceptor.attach(
    libcWrite, {
      onEnter: function(args) {
        if (accessoryFD && args[0].toInt32() === accessoryFD) {
          const size = args[2].toInt32()
          log(`* usb accessory write`)
          log(hexdump(args[1], { length: size }))
          log(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n') + '\n')
        }
      }
    }
  )
}

const libcRead = Module.findExportByName('libc.so', 'read')
if (libcRead) {
  Interceptor.attach(
    libcRead, {
      onEnter: function(args) {
        this.fd = args[0].toInt32()
        this.size = args[2].toInt32()
      },
      onLeave: function(ret) {
        if (accessoryFD && this.fd.toInt32() === accessoryFD) {
          log(`* usb accessory read`)
          log(hexdump(ret, { length: this.size }))
          log(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n') + '\n')
        }
      }
    }
  )
}

console.log(`Reloaded`)