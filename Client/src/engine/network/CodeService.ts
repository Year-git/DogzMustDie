/*
* 网络消息编解码;
* @author WH
* @desc 编解码与服务器相对应。以剑侠情缘兵器谱服务器与客户端通讯的编解码为准。
* 特殊说明：
*   1. 不允许在本类中进行任何的修改及添加上层逻辑。
*/

module H52D_Framework {
    export class CodeService {

        /**发送数据的参数数组*/
        private _args: Array<number> = new Array<number>();
        /**发送数据的参数在数组中的索引*/
        private _nIndex: number;
        /**发送消息编码的字节组*/
        private _enByte: Laya.Byte;

        /**@private 解析的字节索引 */
        private _nUse: number;
        /**@private 解析的数据 */
        private _oData: Array<any>;
        /**@private 解析当前table的当前key值 */
        private _key;
        /**@private table缓存组（用于记录table中嵌套table的操作） */
        private _tables: Array<any>;

        /**@private 最大能够发送的数据尺寸 */
        private _nMaxSendBufferSize: number;

        constructor() {
            this._nIndex = 0;
            this._enByte = new Laya.Byte();
            this._nUse = 0;
            this._oData = [];
            this._key = null;
            this._tables = [];
            this._nMaxSendBufferSize = 4094;
        }

        
        /**
         * 得客户端最大能够发送的数据尺寸
         */
        public GetMaxSendBufferSize() {
            return this._nMaxSendBufferSize;
        }

        /**
         * 编码
         * @param args
         */
        public Encode(...args) {
            this._enByte.clear();
            this._enByte.endian = Laya.Byte.getSystemEndian();
            this._enByte.length = this._nMaxSendBufferSize;     // 服务器最大接收的尺寸
            do {
                this._args = args;
                this._nIndex = 0;

                while (this.ExcuteEncode(this._args[this._nIndex])) {
                    if (++this._nIndex == this._args.length) {
                        break;
                    }
                }
            } while (false);


            return this._enByte;
        }

        /**@private */
        private ExcuteEncode(d) {
            let data = d;
            // 特殊处理，如果传undefined、NaN服务器会把此玩家踢下线
            if (data == undefined || data !== data) {
                data = null;
            }
            // outp(data, typeof data);
            if (typeof data == "object") {
                if (data == null) {
                    //nil == null
                    this._enByte.writeByte(0);
                }
                else if (data instanceof Array) {
                    //table == Array
                    /*
                        这里需要特殊处理下Array。由于服务器是c++结合Lua开发，lua中Object和Array统称为table。
                        那么为了兼容服务器的代码书写和操作，需要在这边将js的Object和Array类型进行拆分，转化为lua的形式。
                        这样服务器逻辑代码不用做任何的更改.
                    */
                    this._enByte.writeByte(16);
                    this._enByte.writeByte(0);
                    for (let idx = 0; idx < data.length; idx++) {
                        if (!this.ExcuteEncode(idx + 1)) { return false; }; //key
                        if( data[idx]._is2D == true ){
                            let a = 1
                        }
                        if (!this.ExcuteEncode(data[idx])) { return false; }; //value
                    }
                    this._enByte.writeByte(0);
                }
                else {
                    //table == object
                    this._enByte.writeByte(16);
                    this._enByte.writeByte(0);
                    for (let prop in data) {
                        if (!this.ExcuteEncode(prop)) { //key
                            return false;
                        }
                        if (!this.ExcuteEncode(data[prop])) { //value
                            return false;
                        }
                    }
                    this._enByte.writeByte(0);
                }
            }
            else if (typeof data == "boolean") {
                //boolean
                this._enByte.writeByte((data) ? 1 : 2);
            }
            else if (typeof data == "number") {
                //number
                if( data % 1 == 0 && data == (data<<58>>58)  )
                {   // 小于一个字节的数
                    this._enByte.writeByte( 64 | (data & 0x3F) );
                }
                else if( data % 1 == 0 && data > -32768 && data < 32767 )
                {   // short
                    this._enByte.writeByte( 5 );
                    this._enByte.writeInt16( data );
                }
                else if( data % 1 == 0 && data > -2147483648 && data < 2417483647 )
                {   // int
                    this._enByte.writeByte( 6 );
                    this._enByte.writeInt32( data );
                }
                else
                {   // double
                    this._enByte.writeByte(4);
                    this._enByte.writeFloat64(data);
                }
            }
            else if (typeof data == "string") {
                //string
                let strlen = BitService.GetBytesLengthForString(data);
                if (strlen < 64) {
                    this._enByte.writeUint8((-128 | strlen) );
                } else {
                    this._enByte.writeByte(9);
                    this._enByte.writeInt16(strlen);
                }
                this._enByte.writeUTFBytes(data);
            }
            else {
                return false;
            }
            return true;
        }


        /**
        * 解码
        * @param data 数据
        * @param len 数据长度
        * @return 返回解析的数据数组
        */
        public Decode(data, len) {
            do {
                this._nUse = 0;
                this._oData.length = 0;
                this._key = null;
                this._tables = [];

                while (this.ExcuteDecode(this._oData, data, len)) {
                    if (this._nUse >= len) { break; };
                }

            } while (false);

            this._nUse = 0;
            return this._oData;
        }


        /**@private 处理解析 */
        private ExcuteDecode(con, data, len) {
            if (!this.Query(1, len, false)) { return false; };
            let flag = data.getByte();
            this.Query(1, len, true);

            if (flag == 0) {
                //nil == null
                this._oData.push(null);
            }
            else if (flag == 1 || flag == 2) {
                //boolean -> 1:true; 2:false
                this._oData.push((flag == 1) ? true : false);
            }
            else {

                let flag1 = flag & 0xC0;
                let flag2 = flag & 0xFC;

                if (flag1 == 128 || flag2 == 8) {
                    //string
                    let strlen = 0;
                    if (flag1 == 128) {
                        strlen = flag & 0x3F;
                    } else if (flag == 9) {
                        if (this.Query(2, len, false)) { return false; };
                        strlen = data.getUint16();
                        this.Query(2, len, true);
                    } else { return false; };

                    if (!this.Query(strlen, len, false)) { return false; };
                    this._oData.push(data.getUTFBytes(strlen));
                    this.Query(strlen, len, true);
                }
                else if (flag1 == 64 || flag2 == 4) {
                    //number
                    let _number = -1;
                    if (flag1 == 64) {
                        _number = flag << 26 >> 26;
                    }
                    else if (flag == 5) {
                        if (!this.Query(2, len, false)) { return false; };
                        _number = data.getInt16();
                        this.Query(2, len, true);
                    }
                    else if (flag == 6) {
                        if (!this.Query(4, len, false)) { return false; };
                        _number = data.getInt32();
                        this.Query(4, len, true);
                    }
                    else if (flag == 7 || flag == 4) {
                        if (!this.Query(8, len, false)) { return false; };
                        _number = data.getFloat64();
                        this.Query(8, len, true);
                    }
                    else { return false; }
                    this._oData.push(_number);
                }
                else if (flag2 == 16) {
                    //table == object
                    if (flag == 16) {
                        if (!this.Query(1, len, false)) { return false; };
                        data.getByte();
                        this.Query(1, len, true);

                        //创建对象
                        let obj = {};
                        this._tables.push(obj);
                        while (true) {
                            // key
                            if (!this.ExcuteDecodeTable(obj, data, len, true)) { return false; };
                            // 如果解析LuaTable时，当KEY值为null时，说明这个Lua-table已经解析完毕。退出
                            if (this._key == null) {
                                this._tables.pop();
                                break;
                            }
                            // value 
                            if (!this.ExcuteDecodeTable(obj, data, len, false)) { return false; };
                        }
                        this._oData.push(obj);
                    }
                    else { return false; };
                }
                else { return false; };
            }
            return true;
        }


        /**@private 处理Lua-Table */
        private ExcuteDecodeTable(o, data, len, iskey) {
            if (!this.Query(1, len, false)) { return false; };
            let flag = data.getByte();
            this.Query(1, len, true);

            if (flag == 0) {
                //nil == null
                if (iskey) { this._key = null; }
                else { o[this._key] = null; }
            }
            else if (flag == 1 || flag == 2) {
                //boolean -> 1:true; 2:false
                let b = (flag == 1) ? true : false;
                if (iskey) { this._key = String(b) }
                else { o[this._key] = b; };
            }
            else {

                let flag1 = flag & 0xC0;
                let flag2 = flag & 0xFC;

                if (flag1 == 128 || flag2 == 8) {
                    //string
                    let strlen = 0;
                    if (flag1 == 128) {
                        strlen = flag & 0x3F;
                    } else if (flag == 9) {
                        if (!this.Query(2, len, false)) { return false; };
                        strlen = data.getUint16();
                        this.Query(2, len, true);
                    } else { return false; };

                    if (!this.Query(strlen, len, false)) { return false; };

                    let __str = data.getUTFBytes(strlen);
                    if (iskey) { this._key = __str; }
                    else { o[this._key] = __str; }

                    this.Query(strlen, len, true);
                }
                else if (flag1 == 64 || flag2 == 4) {
                    //number
                    let _number = -1;
                    if (flag1 == 64) {
                        _number = flag << 26 >> 26;
                    }
                    else if (flag == 5) {
                        if (!this.Query(2, len, false)) { return false; };
                        _number = data.getInt16();
                        this.Query(2, len, true);
                    }
                    else if (flag == 6) {
                        if (!this.Query(4, len, false)) { return false; };
                        _number = data.getInt32();
                        this.Query(4, len, true);
                    }
                    else if (flag == 7 || flag == 4) {
                        if (!this.Query(8, len, false)) { return false; };
                        _number = data.getFloat64();
                        this.Query(8, len, true);
                    }
                    else { return false; }

                    if (iskey) { this._key = _number; }
                    else { o[this._key] = _number; }
                }
                else if (flag2 == 16) {
                    //table == object
                    if (flag == 16) {
                        if (!this.Query(1, len, false)) { return false; };
                        data.getByte();
                        this.Query(1, len, true);

                        //创建对象
                        let obj = {};
                        this._tables[this._tables.length - 1][this._key] = obj;
                        this._tables.push(obj);
                        while (true) {
                            // key
                            if (!this.ExcuteDecodeTable(obj, data, len, true)) { return false; };
                            // 如果解析LuaTable时，当KEY值为null时，说明这个Lua-table已经解析完毕。退出
                            if (this._key == null) {
                                this._tables.pop();
                                break;
                            };
                            // value
                            if (!this.ExcuteDecodeTable(obj, data, len, false)) { return false; };
                        }
                    }
                    else { return false; };

                }
                else { return false; };
            }
            return true;
        }


        /**@private 解析的字节长度累加函数（用于记录和越界判断）*/
        private Query(num, len, b) {
            if (!b) {
                if (this._nUse + num > len) { return false; };
                return true;
            }
            else { this._nUse += num; };
            return true;
        }
    }
}